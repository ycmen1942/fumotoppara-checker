const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

// 通知対象の月と曜日を設定（0=1月, 5=6月）
const TARGET_MONTHS = [5, 6, 7]; // 6〜8月
const TARGET_DAYS = [5, 6]; // 金曜・土曜

function isTargetFridayOrSaturday(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth();
  const dayOfWeek = date.getDay();
  return (
    date.getFullYear() === 2025 &&
    TARGET_MONTHS.includes(month) &&
    TARGET_DAYS.includes(dayOfWeek)
  );
}

async function checkAvailability() {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });

  const page = await browser.newPage();
  console.log("アクセス中: ふもとっぱら予約ページ");
  await page.goto("https://reserve.fumotoppara.net/reserved/reserved-calendar-list", {
    waitUntil: "networkidle0",
  });

  await page.waitForSelector("table.calendar-table");

  const availableDays = await page.evaluate(() => {
    const result = [];
    const tables = document.querySelectorAll("table.calendar-table");

    tables.forEach(table => {
      const caption = table.querySelector("caption")?.textContent.trim();
      let year = new Date().getFullYear();
      let month = null;

      if (caption) {
        const match = caption.match(/(\d{4})年(\d{1,2})月/);
        if (match) {
          year = parseInt(match[1], 10);
          month = parseInt(match[2], 10);
        }
      }

      if (month === null) return;

      const headers = Array.from(table.querySelectorAll("thead th"))
        .slice(1)
        .map(th => th.textContent.trim());

      const rows = table.querySelectorAll("tbody tr");
      rows.forEach(row => {
        const planName = row.querySelector("th.cell-site p")?.textContent.trim();
        if (planName && planName.includes("キャンプ宿泊")) {
          const cells = row.querySelectorAll("td.cell-date");
          cells.forEach((cell, index) => {
            const text = cell.textContent.trim();
            if (text.includes("○") || text.includes("△") || text.includes("残")) {
              const dayStr = headers[index];
              if (!dayStr.includes("/")) return;
              const [cellMonth, day] = dayStr.split("/").map(n => parseInt(n, 10));
              const fullDate = `${year}-${String(cellMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              result.push(fullDate);
            }
          });
        }
      });
    });

    return result;
  });

  console.log(`[INFO] 検出された空き日: ${availableDays.join(", ")}`);
  const targetDays = availableDays.filter(isTargetFridayOrSaturday);
  console.log(`[INFO] 対象の金・土: ${targetDays.join(", ") || "なし"}`);

  if (targetDays.length > 0) {
    const message = "【ふもとっぱら】6〜8月の金・土に「キャンプ宿泊」の空きあり！\n" + targetDays.join("\n");
    await sendLine(message);
  } else {
    console.log("【INFO】通知対象日なし。通知スキップ。");
  }

  await browser.close();
}

async function sendLine(message) {
  console.log("LINE通知送信中...");
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
    console.error(`LINE API エラー: ${res.status} - ${JSON.stringify(json)}`);
    throw new Error(`LINE API error: ${res.status}`);
  }
  console.log("LINE通知が完了しました。");
}

checkAvailability();
