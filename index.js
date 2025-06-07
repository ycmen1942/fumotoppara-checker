const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID    = process.env.LINE_USER_ID;

// 通知対象の月と曜日
const TARGET_MONTHS = [5, 6, 7]; // 6〜8月
const TARGET_DAYS   = [5, 6];    // 金・土

function isTargetDate(dateStr) {
  const d = new Date(dateStr);
  return (
    d.getFullYear() === 2025 &&
    TARGET_MONTHS.includes(d.getMonth()) &&
    TARGET_DAYS.includes(d.getDay())
  );
}

async function checkAvailability() {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox","--disable-setuid-sandbox"],
    headless: true
  });
  const page = await browser.newPage();

  // ① User-Agent偽装
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/115.0.0.0 Safari/537.36"
  );

  console.log("アクセス中: ふもとっぱら予約ページ");
  await page.goto(
    "https://reserve.fumotoppara.net/reserved/reserved-calendar-list",
    { waitUntil: "networkidle2" }
  );

  // ② 描画完了まで待機 (calendar-tableが表示されるまで)
  await page.waitForSelector("table.calendar-table", { timeout: 15000 });

  // ③ HTMLを取得して先頭をログ出力
  const htmlSnippet = await page.content();
  console.log("[DEBUG] ページ先頭HTML:\n", htmlSnippet.slice(0, 500));

  // ④ 解析処理
  const availableDays = await page.evaluate(() => {
    const result = [];
    document.querySelectorAll("table.calendar-table").forEach(table => {
      // キャプションから年・月
      const cap = table.querySelector("caption")?.textContent || "";
      const m = cap.match(/(\d{4})年(\d{1,2})月/);
      if (!m) return;
      const [_, year, mon] = m;
      const Y = parseInt(year, 10), M = parseInt(mon, 10);

      // 日付ヘッダ
      const headers = Array.from(table.querySelectorAll("thead th"))
        .slice(1).map(th=>th.textContent.trim());

      // 行をループ
      table.querySelectorAll("tbody tr").forEach(row => {
        const plan = row.querySelector("th.cell-site p")?.textContent || "";
        if (!plan.includes("キャンプ宿泊")) return;
        row.querySelectorAll("td.cell-date").forEach((cell,i) => {
          if (/[○△残]/.test(cell.textContent.trim())) {
            const [hMon, hDay] = headers[i].split("/").map(n=>parseInt(n,10));
            result.push(
              `${Y}-${String(hMon).padStart(2,"0")}-${String(hDay).padStart(2,"0")}`
            );
          }
        });
      });
    });
    return result;
  });

  console.log(`[INFO] 検出された空き日: ${availableDays.join(", ")}`);
  const target = availableDays.filter(isTargetDate);
  console.log(`[INFO] 対象の金・土: ${target.join(", ") || "なし"}`);

  if (target.length) {
    await sendLine(`【ふもとっぱら】6〜8月の金・土に空きあり！\n${target.join("\n")}`);
  } else {
    console.log("【INFO】通知対象日なし。通知スキップ。");
  }

  await browser.close();
}

async function sendLine(msg) {
  console.log("LINE通知送信中...");
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type":"application/json",
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ to: LINE_USER_ID, messages:[{type:"text",text:msg}] })
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("LINE API エラー:", res.status, text);
    throw new Error("LINE通知失敗");
  }
  console.log("LINE通知完了:", text);
}

checkAvailability();
