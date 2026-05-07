const puppeteer = require("puppeteer");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

const CACHE_DIR = ".notified_cache";
const CACHE_FILE = path.join(CACHE_DIR, "notified_cache.json");

// ==============================
// チェック対象日
// ==============================
const targetDates = [
  "2026-05-10"
];

// 年を自動取得
const targetYear = targetDates[0].split("-")[0];

async function checkAvailability() {
  const notifiedMap = loadNotifiedMap();

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  const page = await browser.newPage();

  page.on("console", msg => {
    for (let i = 0; i < msg.args().length; ++i) {
      msg.args()[i]
        .jsonValue()
        .then(v => console.log(`🧭 [ブラウザログ] ${v}`))
        .catch(() => {});
    }
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
  );

  const url =
    "https://reserve.fumotoppara.net/reserved/reserved-calendar-list";

  console.log("🌐 アクセス中:", url);

  let retries = 3;
  let success = false;
  let data = [];

  while (retries-- > 0 && !success) {
    try {
      await page.goto(url, {
  waitUntil: "domcontentloaded",
  timeout: 60000
});

// JS描画待ち
await new Promise(resolve =>
  setTimeout(resolve, 8000)
);

// テーブル完成待ち
await page.waitForFunction(() => {
  const rows = document.querySelectorAll(
    ".calendar-frame table tr"
  );

  return rows.length > 5;
}, {
  timeout: 30000
});
      data = await page.evaluate((targetDates, targetYear) => {
        const results = [];

        const calendarTable = document.querySelector(
          ".calendar-frame table"
        );

        if (!calendarTable) {
          console.log("⚠️ カレンダーテーブル未検出");
          return results;
        }

        const rows = calendarTable.querySelectorAll("tr");

        if (rows.length <= 5) {
          console.log("⚠️ テーブル行不足");
          return results;
        }

        let dateHeaders = [];

        rows.forEach((tr, idx) => {
          if (idx === 0) {
            dateHeaders = Array.from(
              tr.querySelectorAll("th.cell-date")
            ).map(th => {
              const dateText =
                th.querySelector("p")?.innerText.trim();

              if (!dateText) return null;

              const [monthStr, dayStr] = dateText.split("/");

              if (!monthStr || !dayStr) {
                console.log(
                  `⚠️ 日付分解失敗: ${dateText}`
                );
                return null;
              }

              return {
                month: monthStr,
                day: dayStr
              };
            });
          }
        });

        rows.forEach(row => {
          const siteCell = row.querySelector("th.cell-site");

          if (
            !siteCell ||
            !siteCell.innerText.includes("キャンプ宿泊")
          ) {
            return;
          }

          const cells = row.querySelectorAll("td.cell-date");

          cells.forEach((cell, i) => {
            const status = cell.innerText.trim();

            const header = dateHeaders[i];

            if (!header) return;

            const date =
              `${targetYear}-` +
              `${header.month.padStart(2, "0")}-` +
              `${header.day.padStart(2, "0")}`;

            const isTarget = targetDates.includes(date);

            // 空き判定
            const isAvailable =
              /(〇|◯|△|残|空き)/.test(status);

            console.log(
              `📅 ${date} | "${status}" | target=${isTarget} | available=${isAvailable}`
            );

            if (isTarget && isAvailable) {
              results.push({
                date,
                status
              });
            }
          });
        });

        return results;
      }, targetDates, targetYear);

      success = true;
    } catch (e) {
      console.error("❌ 読み込み失敗:", e.message);

      if (retries > 0) {
        console.log("🔄 リトライします...");
        await new Promise(resolve =>
          setTimeout(resolve, 3000)
        );
      }
    }
  }

  await browser.close();

  console.log("🔍 検出結果:", JSON.stringify(data, null, 2));

  const now = new Date();

  const available = data
    .filter(({ date }) => {
      const lastNotified = notifiedMap[date];

      if (!lastNotified) return true;

      const elapsed =
        now - new Date(lastNotified);

      // 24時間後に再通知許可
      return elapsed > 1000 * 60 * 60 * 24;
    })
    .map(d => d.date);

  console.log(
    "✅ 通知対象:",
    available.length ? available.join(", ") : "なし"
  );

  if (available.length) {
    const message =
      "【ふもとっぱら】指定日に空きあり！\n\n" +
      available.join("\n");

    await sendLine(message);

    available.forEach(date => {
      notifiedMap[date] = now.toISOString();
    });

    saveNotifiedMap(notifiedMap);
  } else {
    console.log("📭 空きなし");
  }
}

async function sendLine(msg) {
  try {
    const res = await fetch(
      "https://api.line.me/v2/bot/message/push",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          to: LINE_USER_ID,
          messages: [
            {
              type: "text",
              text: msg
            }
          ]
        })
      }
    );

    const text = await res.text();

    console.log("📨 LINEレスポンス:", text);

    if (!res.ok) {
      throw new Error(
        `LINE送信失敗: ${res.status}`
      );
    }

    console.log("✅ LINE通知完了");
  } catch (e) {
    console.error("❌ LINE通知エラー:", e.message);
  }
}

function loadNotifiedMap() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(
        CACHE_FILE,
        "utf8"
      );

      return JSON.parse(content);
    }
  } catch (e) {
    console.warn(
      "⚠️ キャッシュ読込失敗:",
      e.message
    );
  }

  return {};
}

function saveNotifiedMap(map) {
  try {
    fs.mkdirSync(CACHE_DIR, {
      recursive: true
    });

    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify(map, null, 2)
    );

    console.log("💾 キャッシュ保存完了");
  } catch (e) {
    console.error(
      "❌ キャッシュ保存失敗:",
      e.message
    );
  }
}

checkAvailability();
