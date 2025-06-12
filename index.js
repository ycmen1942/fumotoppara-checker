const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

// ✅ チェック対象の日付
const targetDates = ["2025-07-10", "2025-07-18", "2025-08-10"];

async function checkAvailability() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  page.on("console", msg => {
    for (let i = 0; i < msg.args().length; ++i)
      msg.args()[i].jsonValue().then(v => console.log(`🧭 [ブラウザログ] ${v}`));
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );

  const url = "https://reserve.fumotoppara.net/reserved/reserved-calendar-list";
  console.log("アクセス中: カレンダーページ");

  let retries = 3;
  let success = false;
  let data = [];

  while (retries-- > 0 && !success) {
    await page.goto(url, { waitUntil: "networkidle2" });

    try {
      await page.waitForSelector(".calendar-frame table", { timeout: 10000 });

      data = await page.evaluate((targetDates) => {
        const results = [];
        const calendarTable = document.querySelector(".calendar-frame table");
        if (!calendarTable) {
          console.log("⚠️ calendar-table が見つかりません");
          return results;
        }

        const rows = calendarTable.querySelectorAll("tr");
        if (rows.length <= 1) {
          console.log("⚠️ 行数が1（ヘッダーのみ）のため無効なデータと判断");
          return results;
        }

        let dateHeaders = [];
        rows.forEach((tr, idx) => {
          if (idx === 0) {
            dateHeaders = Array.from(tr.querySelectorAll("th.cell-date")).map((th) => {
              const firstP = th.querySelector("p");
              if (!firstP) {
                console.log("⚠️ 日付ヘッダーに <p> が見つかりません");
                return null;
              }
              const text = firstP.innerText.trim(); // 例: "8/1"
              const [monthStr, dayStr] = text.split("/");
              if (!monthStr || !dayStr) {
                console.log(`⚠️ 日付ヘッダーの分解失敗: "${text}"`);
                return null;
              }
              return {
                month: monthStr.padStart(2, "0"),
                day: dayStr.padStart(2, "0"),
              };
            }).filter(Boolean);
          }
        });

        rows.forEach((row) => {
          const siteCell = row.querySelector("th.cell-site");
          if (!siteCell || !siteCell.innerText.includes("キャンプ宿泊")) return;

          const cells = row.querySelectorAll("td.cell-date");
          cells.forEach((cell, i) => {
            const status = cell.innerText.trim();
            const header = dateHeaders[i];
            if (!header) return;

            const date = `2025-${header.month}-${header.day}`;
            const isTarget = targetDates.includes(date);
            const isAvailable = ["○", "△", "残"].some(s => status.includes(s));

            console.log(
              `→ ${date} | ステータス: "${status}" | isTarget=${isTarget} | isAvailable=${isAvailable}`
            );

            if (isTarget && isAvailable) {
              results.push({ date, status });
            }
          });
        });

        return results;
      }, targetDates);

      if (data.length > 0 || retries === 0) {
        success = true;
      } else {
        console.log("🔄 再試行します...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (e) {
      console.error("❌ ページ読み込み失敗:", e.message);
    }
  }

  await browser.close();

  const available = data.map(d => d.date);
  console.log("✅ 指定日空き:", available.join(", ") || "なし");

  if (available.length) {
    await sendLine("【ふもとっぱら】指定日に空きあり！\n" + available.join("\n"));
  }
}

async function sendLine(msg) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      to: LINE_USER_ID,
      messages: [{ type: "text", text: msg }]
    })
  });
  console.log("📨 LINE通知完了");
}

checkAvailability();
