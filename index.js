const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

const TARGET_MONTHS = [6, 7, 8];
const TARGET_WEEKDAY = 6; // 土曜日（0=日, 6=土）

function isSaturdayInTargetRange(dateStr) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDay();
  return TARGET_MONTHS.includes(month) && day === TARGET_WEEKDAY;
}

async function checkAvailability() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/115.0.0.0 Safari/537.36"
  );

  console.log("アクセス中: カレンダーページ");
  await page.goto(
    "https://reserve.fumotoppara.net/reserved/reserved-calendar-list",
    { waitUntil: "networkidle2" }
  );

  // table が描画されるのを明示的に待つ
  await page.waitForSelector("table.calendar-table", { timeout: 10000 });

  const data = await page.evaluate(() => {
    const results = [];

    const table = document.querySelector("table.calendar-table");
    if (!table) {
      console.log("❌ calendar-table が見つかりません");
      return results;
    }

    const headerRows = table.querySelectorAll("thead tr");
    if (headerRows.length < 2) {
      console.log("❌ ヘッダー行不足");
      return results;
    }

    const monthRow = headerRows[0];
    const dayRow = headerRows[1];

    const months = Array.from(monthRow.querySelectorAll("th.cell-date")).map(th =>
      th.innerText.trim().replace("月", "")
    );
    const days = Array.from(dayRow.querySelectorAll("th.cell-date")).map(th =>
      th.innerText.trim()
    );

    const bodyRows = table.querySelectorAll("tbody tr");

    bodyRows.forEach(row => {
      const siteCell = row.querySelector("th.cell-site");
      if (!siteCell || !siteCell.innerText.includes("キャンプ宿泊")) return;

      const cells = row.querySelectorAll("td.cell-date");

      cells.forEach((cell, i) => {
        const p = cell.querySelector("p");
        const status = p ? p.innerText.trim() : "";

        const dayLabel = days[i] || "?";
        const month = months[i] || "?";

        const match = cell.innerText.match(/\d+/);
        const day = match ? match[0].padStart(2, "0") : null;
        const fullDate = (month && day) ? `2025-${month.padStart(2, "0")}-${day}` : null;

        console.log(`🔍 ${month}月${day || "??"}日 (${dayLabel}) → 状態: ${status}`);

        if (!fullDate || dayLabel !== "土") return;
        if (!["〇", "△", "残"].some(s => status.includes(s))) return;

        results.push({ date: fullDate, status });
      });
    });

    return results;
  });

  await browser.close();

  const availableDates = data.map(d => d.date);
  const saturdays = availableDates.filter(isSaturdayInTargetRange);

  console.log("✅ 空き日候補:", availableDates.length ? availableDates.join(", ") : "なし");
  console.log("🎯 対象土曜日:", saturdays.length ? saturdays.join(", ") : "なし");

  if (saturdays.length > 0) {
    await sendLine("【ふもとっぱら】土曜空きあり！\n" + saturdays.join("\n"));
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
  console.log("✅ LINE通知完了");
}

checkAvailability().catch(e => {
  console.error("❌ エラー:", e);
  process.exit(1);
});
