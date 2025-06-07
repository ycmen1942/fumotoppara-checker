const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID      = process.env.LINE_USER_ID;

const START_DATE = "2025-06-01";
const END_DATE   = "2025-09-30";
const TARGET_MONTHS  = [6,7,8];
const TARGET_WEEKDAYS = [5,6];

function isTargetDate(str) {
  const d = new Date(str);
  return TARGET_MONTHS.includes(d.getMonth()+1) && TARGET_WEEKDAYS.includes(d.getDay());
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

  // ページ内から空き状況をスクレイピング
  const data = await page.evaluate(() => {
    const rows = document.querySelectorAll(".calendar-frame .cell-site");
    let results = [];
    rows.forEach(row => {
      const siteName = row.textContent.trim();
      if (!siteName.includes("キャンプ宿泊")) return;

      const tr = row.closest("tr");
      const cells = tr.querySelectorAll("td.cell-date");
      cells.forEach(cell => {
        const date = cell.getAttribute("data-date");
        const status = cell.textContent.trim();
        results.push({ date, status });
      });
    });
    return results;
  });

  await browser.close();

  // 空き状況を解析
  const available = data
    .filter(d => d.date && ["○","△","残"].some(s => d.status.includes(s)))
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
    body: JSON.stringify({ to: LINE_USER_ID, messages: [{ type: "text", text: msg }] })
  });
  console.log("LINE通知完了");
}

checkAvailability();
