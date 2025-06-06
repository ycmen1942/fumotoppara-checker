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
    [5, 6, 7].includes(month) &&
    (dayOfWeek === 5 || dayOfWeek === 6)
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

  const availableDays = await page.evaluate(() => {
    const result = [];
    const table = document.querySelector("table.calendar-table");
    if (!table) {
      console.error("テーブルが見つかりません");
      return result;
    }

    const headers = Array.from(table.querySelectorAll("thead th"))
      .slice(1)
      .map(th => th.textContent.trim());

    const rows = table.querySelectorAll("tbody tr");
    rows.forEach(row => {
      const planTh = row.querySelector("th.cell-site p");
      const planName = planTh?.textContent?.trim() || "";
      if (planName.includes("キャンプ宿泊")) {
        const cells = row.querySelectorAll("td.cell-date");
        cells.forEach((cell, index) => {
          const status = cell.textContent.trim();
          if (status.includes("○") || status.includes("△") || status.includes("残")) {
            const dateStr = headers[index];
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

  console.log(`[INFO] 「キャンプ宿泊」で○または△がある日: ${availableDays.join(", ")}`);
  await browser.close();

  const targetDays = availableDays.filter(isTargetFridayOrSaturday);
  console.log(`[INFO] 対象の金・土: ${targetDays.join(", ") || "なし"}`);

  if (targetDays.length > 0) {
    const message = "【ふもとっぱら】6〜8月の金・土「キャンプ宿泊」空きあり(残りわずか含む)！\n" + targetDays.join("\n");
    await sendLine(message);
  } else {
    console.log("【INFO】6〜8月の金・土曜日に空き(残りわずか含む)はありません。通知はスキップします。");
  }
}

// LINEにメッセージを送信
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

// 実行
checkAvailability();
