const puppeteer = require("puppeteer");
const fetch = require("node-fetch"); // もう使いませんが、sendLine に残しておきます

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID      = process.env.LINE_USER_ID;

// 取得期間 (必要に応じて変更)
const START_DATE = "2025-06-01";
const END_DATE   = "2025-09-30";

// 通知対象の月 (1月=1) と曜日
const TARGET_MONTHS   = [6, 7, 8];
const TARGET_WEEKDAYS = [5, 6]; // 金曜=5, 土曜=6

function isTargetDate(dateStr) {
  const d = new Date(dateStr);
  return (
    TARGET_MONTHS.includes(d.getMonth() + 1) &&
    TARGET_WEEKDAYS.includes(d.getDay())
  );
}

async function checkAvailability() {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });
  const page = await browser.newPage();

  // 実ブラウザと同じUAにするとより安全
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

  // ブラウザ側セッションで JSON API を呼び出し
  const data = await page.evaluate(
    async (start, end) => {
      const res = await fetch("/api/shared/reserve/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: start, endDate: end }),
      });
      return res.json();
    },
    START_DATE,
    END_DATE
  );

  await browser.close();

  // 「キャンプ宿泊」のプラン部分を探す
  const stayPlan = data.calendarsSiteList.find(
    x => x.stayDiv === "STAY" && x.siteName.includes("キャンプ宿泊")
  );
  if (!stayPlan) {
    console.error("キャンプ宿泊プランが見つかりません");
    return;
  }

  const dates = stayPlan.calendarDates || stayPlan.dates;
  const available = dates
    .filter(d => ["○","△","残"].includes(d.status))
    .map(d => d.date);

  console.log("API 取得 空き日:", available.join(", "));

  const targets = available.filter(isTargetDate);
  console.log("対象（金・土）:", targets.join(", ") || "なし");

  if (targets.length > 0) {
    const msg =
      `【ふもとっぱら】6〜8月の金・土に空きあり！\n` +
      targets.join("\n");
    await sendLine(msg);
  } else {
    console.log("通知対象なし。スキップ。");
  }
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
  const txt = await res.text();
  if (!res.ok) {
    console.error("LINE通知エラー:", res.status, txt);
  } else {
    console.log("LINE通知完了");
  }
}

checkAvailability();
