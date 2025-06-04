// index.js - ふもとっぱら予約状況をチェックしてLINEに通知（6〜8月の土曜）
// puppeteerを使って予約カレンダーをスクレイピングし、LINE Messaging APIで空き状況を通知します。

const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

// 環境変数からLINEのアクセストークンと宛先ユーザーIDを取得
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

// 指定された日付文字列が 2025年6〜8月の土曜日かどうかを判定
function isTargetSaturday(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth();
  const isTarget = (
    date.getFullYear() === 2025 &&
    [5, 6, 7].includes(month) && // 5=6月, 6=7月, 7=8月
    date.getDay() === 6 // 土曜日
  );
  console.log(`[DEBUG] ${dateStr} -> 月: ${month + 1}, 曜日: ${date.getDay()} => ${isTarget ? "対象" : "対象外"}`);
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

  // ○が付いた日付をすべて取得
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

  console.log(`[INFO] ○がある日: ${availableDays.join(", ")}`);
  await browser.close();

  // 6〜8月の土曜日に絞り込む
  const saturdays = availableDays.filter(isTargetSaturday);
  console.log(`[INFO] 対象の土曜: ${saturdays.join(", ") || "なし"}`);

  if (saturdays.length > 0) {
    const message = "【ふもとっぱら】6〜8月の土曜 空きあり！\n" + saturdays.join("\n");
    await sendLine(message);
  } else {
    console.log("【INFO】6〜8月の土曜日に空きはありません。通知はスキップします。");
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
