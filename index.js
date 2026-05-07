const puppeteer = require("puppeteer");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;
const CACHE_DIR = ".notified_cache";
const CACHE_FILE = path.join(CACHE_DIR, "notified_cache.json");

// ✅ チェック対象の日付（必要に応じて変更）
const targetDates = ["2026-05-07"];

async function checkAvailability() {
  const notifiedMap = loadNotifiedMap();

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
              const dateText = th.querySelector("p")?.innerText.trim();
              if (!dateText) return null;

              const [monthStr, dayStr] = dateText.split("/");
              if (!monthStr || !dayStr) {
                console.log(`⚠️ 日付ヘッダーの分解失敗: "${dateText}"`);
                return null;
              }
              return { month: monthStr, day: dayStr };
            });
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

            const date = `2025-${header.month.padStart(2, "0")}-${header.day.padStart(2, "0")}`;
            const isTarget = targetDates.includes(date);
            const isAvailable = ["〇", "△", "残"].some(s => status.includes(s));

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

  const now = new Date();
  const available = data
    .filter(({ date }) => {
      const lastNotified = notifiedMap[date];
      if (!lastNotified) return true;
      const elapsed = now - new Date(lastNotified);
      return elapsed > 1000 * 60 * 60 * 24; // 24時間超
    })
    .map(d => d.date);

  console.log("✅ 通知対象:", available.join(", ") || "なし");

  if (available.length) {
    await sendLine("【ふもとっぱら】指定日に空きあり！\n" + available.join("\n"));
    available.forEach(date => {
      notifiedMap[date] = now.toISOString();
    });
    saveNotifiedMap(notifiedMap);
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

function loadNotifiedMap() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, "utf8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn("⚠️ 通知キャッシュ読み込み失敗:", e.message);
  }
  return {};
}

function saveNotifiedMap(map) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(map, null, 2));
    console.log("💾 通知キャッシュ保存完了");
  } catch (e) {
    console.error("❌ 通知キャッシュ保存失敗:", e.message);
  }
}

checkAvailability();
