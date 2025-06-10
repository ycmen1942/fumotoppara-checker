const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID      = process.env.LINE_USER_ID;

const START_DATE = "2025-06-01";
const END_DATE   = "2025-09-30";
const TARGET_MONTHS  = [6, 7, 8];
const TARGET_WEEKDAYS = [5, 6]; // 金=5, 土=6

function isTargetDate(str) {
  const d = new Date(str);
  return (
    TARGET_MONTHS.includes(d.getMonth() + 1) &&
    TARGET_WEEKDAYS.includes(d.getDay()) &&
    d >= new Date(START_DATE) &&
    d <= new Date(END_DATE)
  );
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
  await page.goto(
    "https://reserve.fumotoppara.net/reserved/reserved-calendar-list",
    { waitUntil: "networkidle2" }
  );

  const data = await page.evaluate(() => {
    const results = [];

    const table = document.querySelector("table.calendar-table");
    const headerRows = table.querySelectorAll("thead tr");
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
        const symbol = cell.textContent.trim();
        const p = cell.querySelector("p");
        if (!p || !["〇", "△", "残"].some(s => p.innerText.includes(s))) return;

        const month = months[i];
        const dayLabel = days[i];

        // セル内の数字（日）を取得（例：△ 14）
        const dayNumMatch = cell.innerText.match(/\d+/);
        if (!dayNumMatch) return;

        const day = dayNumMatch[0].padStart(2, "0");
        const fullDate = `2025-${month.padStart(2, "0")}-${day}`;

        results.push({ date: fullDate, status: symbol });
      });
    });

    return results;
  });

  await browser.close();

  // 空き状況を解析
  const available = data
    .filter(d => d.date && ["○", "△", "残"].some(s => d.status.includes(s)))
    .map(d => d.date);

  console.log("空き日:", available.join(", "));

  const targets = available.filter(isTargetDate);
  console.log("対象金土:", targets.join(", ") || "なし");

  if (targets.length) {
    await sendLine("【ふもとっぱら】金・土空きあり！\n" + targets.join("\n"));
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
  console.log("LINE通知完了");
}

checkAvailability();
