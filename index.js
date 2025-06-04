const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

function isTargetSaturday(dateStr) {
  const date = new Date(dateStr);
  return (
    date.getFullYear() === 2025 &&
    [5, 6, 7].includes(date.getMonth()) && // 6月, 7月, 8月
    date.getDay() === 6 // 土曜日
  );
}

async function checkAvailability() {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });

  const page = await browser.newPage();
  await page.goto("https://reserve.fumotoppara.net/reserved/reserved-date-selection", {
    waitUntil: "networkidle0",
  });

  const availableDays = await page.evaluate(() => {
    const result = [];
    const buttons = document.querySelectorAll(".day-select-button");
    buttons.forEach((btn) => {
      if (btn.textContent.includes("○")) {
        const dateStr = btn.getAttribute("data-date");
        result.push(dateStr);
      }
    });
    return result;
  });

  await browser.close();

  const saturdays = availableDays.filter(isTargetSaturday);

  if (saturdays.length > 0) {
    const message = "【ふもとっぱら】6〜8月の土曜 空きあり！\n" + saturdays.join("\n");
    await sendLine(message);
  } else {
    console.log("6〜8月の土曜日に空きはありません。");
  }
}

async function sendLine(message) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: LINE_USER_ID,
      messages: [{ type: "text", text: message }],
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`LINE API error: ${res.status} - ${JSON.stringify(json)}`);
  }
}

checkAvailability();
