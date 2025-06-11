const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

const TARGET_WEEKDAY = 6; // 土曜日
const TARGET_MONTHS = [6, 7, 8];

function isSaturdayInTargetRange(dateStr) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  return d.getDay() === TARGET_WEEKDAY && TARGET_MONTHS.includes(month);
}

async function checkAvailability() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/115.0.0.0 Safari/537.36"
  );

  console.log("アクセス中: カレンダーページ");
  await page.goto("https://reserve.fumotoppara.net/reserved/reserved-calendar-list", {
    waitUntil: "networkidle2"
  });

  // DOMを解析
  await page.waitForSelector(".calendar-frame");

  const data = await page.evaluate(() => {
    const results = [];

    const calendarTable = document.querySelector(".calendar-frame table");
    if (!calendarTable) return results;

    const rows = calendarTable.querySelectorAll("tr");

    // ヘッダーから日付情報を取得
    let dateHeaders = [];
    rows.forEach((tr, idx) => {
      if (idx === 0) {
        dateHeaders = Array.from(tr.querySelectorAll("th.cell-date")).map(th => {
          const ps = th.querySelectorAll("p");
          const dateText = ps[0]?.innerText.trim(); // 6/14
          const dayOfWeek = ps[1]?.innerText.trim(); // 土
          return { dateText, dayOfWeek };
        });
      }
    });

    // 空き情報取得
    rows.forEach(row => {
      const siteCell = row.querySelector("th.cell-site");
      if (!siteCell || !siteCell.innerText.includes("キャンプ宿泊")) return;

      const cells = row.querySelectorAll("td.cell-date");

      cells.forEach((cell, i) => {
        const status = cell.innerText.trim();
        const header = dateHeaders[i];
        if (!header || !header.dateText || !header.dayOfWeek) return;

        const [monthStr, dayStr] = header.dateText.split("/");
        const date = `2025-${monthStr.padStart(2, "0")}-${dayStr.padStart(2, "0")}`;

        console.log(`📅 ${date} (${header.dayOfWeek}) = ${status}`);

        if (header.dayOfWeek === "土" && ["○", "△", "残"].some(s => status.includes(s))) {
          results.push({ date, status });
        }
      });
    });

    return results;
  });

  await browser.close();

  const dates = data.map(d => d.date);
  console.log("✅ 土曜空き候補:", dates.length ? dates.join(", ") : "なし");

  if (dates.length > 0) {
    await sendLine("【ふもとっぱら】土曜空きあり！\n" + dates.join("\n"));
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
  console.log("📩 LINE通知完了");
}

checkAvailability().catch(err => {
  console.error("❌ エラー:", err);
  process.exit(1);
});
