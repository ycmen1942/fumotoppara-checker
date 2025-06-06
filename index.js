const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

// 環境変数からLINEのアクセストークンと宛先ユーザーIDを取得
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

// 指定された日付文字列が 2025年6〜8月の金曜または土曜かどうかを判定
function isTargetFridayOrSaturday(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth();
  const dayOfWeek = date.getDay();
  const isTarget = (
    date.getFullYear() === 2025 &&
    [5, 6, 7].includes(month) && // 5=6月, 6=7月, 7=8月
    (dayOfWeek === 5 || dayOfWeek === 6) // 金曜(5) or 土曜(6)
  );
  console.log(`[DEBUG] ${dateStr} -> 月: ${month + 1}, 曜日: ${dayOfWeek} => ${isTarget ? "対象" : "対象外"}`);
  return isTarget;
}

// メイン関数：予約サイトをチェックしてLINE通知
async function checkAvailability() {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });

  const page = await browser.newPage();
  console.log("アクセス中: ふもとっぱら予約ページ");
  await page.goto("https://reserve.fumotoppara.net/reserved/reserved-date-selection", {
    waitUntil: "networkidle0",
  });

  // 「キャンプ宿泊」の○または△が付いた日付を取得
  const availableDays = await page.evaluate(() => {
    const result = [];
    const table = document.querySelector("table.calendar-table");
    if (!table) {
      console.error("テーブルが見つかりません");
      return result;
    }

    // 日付ヘッダ取得
    const headers = Array.from(table.querySelectorAll("thead th"))
      .slice(1) // 最初の列はプラン名
      .map(th => th.textContent.trim());

    // tbody内の行を取得
    const rows = table.querySelectorAll("tbody tr");
    rows.forEach(row => {
      const planTh = row.querySelector("th.cell-site p");
      const planName = planTh?.textContent?.trim() || "";
      if (planName.includes("キャンプ宿泊")) {
        const cells = row.querySelectorAll("td.cell-date");
        cells.forEach((cell, index) => {
          const status = cell.textContent.trim();
          if (status.includes("○") || status.includes("△") || status.includes("残")) {
            const dateStr = headers[index];  // 例: "6/7"
            const year = 2025;
            const [month, day] = dateStr.split("/").map(n => parseInt(n, 10));
            const fullDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            result.push(fullDate);
          }
        });
      }
    });
    return result;
  });

  console.log(`[INFO] 「キャンプ宿泊」で○または△がある日: ${availableDays.
