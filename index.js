// index.js
const fetch = require("node-fetch");

// ─────────────────────────────────────────────
// 1) LINE 通知設定
// ─────────────────────────────────────────────
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID      = process.env.LINE_USER_ID;

// ─────────────────────────────────────────────
// 2) API 呼び出し設定
// ─────────────────────────────────────────────
// カレンダー API エンドポイント
const API_URL   = "https://reserve.fumotoppara.net/api/shared/reserve/calendars";
// 取得期間（必要に応じて変更してください）
const START_DATE = "2025-06-01";
const END_DATE   = "2025-09-30";

// ─────────────────────────────────────────────
// 3) 通知対象 月・曜日 設定
// ─────────────────────────────────────────────
// 月は 1～12
const TARGET_MONTHS   = [6, 7, 8];    // 6月～8月
// 曜日は 0=日曜、1=月曜 … 5=金曜、6=土曜
const TARGET_WEEKDAYS = [5, 6];       // 金曜・土曜

// ─────────────────────────────────────────────
// 4) 実行関数
// ─────────────────────────────────────────────
async function checkAvailability() {
  // ① カレンダー API を直接 POST
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://reserve.fumotoppara.net",
      "Referer": "https://reserve.fumotoppara.net/reserved/reserved-calendar-list",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/115.0.0.0 Safari/537.36"
    },
    body: JSON.stringify({ startDate: START_DATE, endDate: END_DATE }),
  });

  if (!res.ok) {
    console.error("API エラー:", res.status, await res.text());
    return;
  }

  const data = await res.json();

  // ② 「キャンプ宿泊」プランを抽出
  const stayPlan = data.calendarsSiteList.find(item =>
    item.stayDiv === "STAY" && item.siteName.includes("キャンプ宿泊")
  );
  if (!stayPlan) {
    console.error("キャンプ宿泊プランが見つかりません");
    return;
  }

  // 実際の日付配列（キー名は JSON に合わせて）
  const dates = stayPlan.calendarDates || stayPlan.dates;
  if (!Array.isArray(dates)) {
    console.error("日付データの形式が不明です", Object.keys(stayPlan));
    return;
  }

  // ③ 空きステータスの日付だけ抽出
  const available = dates
    .filter(d => ["○", "△", "残"].includes(d.status))
    .map(d => d.date);  // 例: "2025-06-13"

  console.log("API 検出された空き日:", available.join(", "));

  // ④ 金・土かつ設定月のみ絞り込み
  const targets = available.filter(str => {
    const d = new Date(str);
    // 月は getMonth()+1 で 1～12
    return (
      TARGET_MONTHS.includes(d.getMonth() + 1) &&
      TARGET_WEEKDAYS.includes(d.getDay())
    );
  });

  console.log("対象（金・土）:", targets.join(", ") || "なし");

  // ⑤ LINE 通知
  if (targets.length > 0) {
    const msg = `【ふもとっぱら】${TARGET_MONTHS.join("〜")}月の金・土に空きあり！\n` +
                targets.join("\n");
    await sendLine(msg);
  } else {
    console.log("【INFO】通知対象日なし。スキップ。");
  }
}

// LINE に通知を送信
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
  const txt = await res.text();
  if (!res.ok) {
    console.error("LINE通知エラー:", res.status, txt);
  } else {
    console.log("LINE通知完了");
  }
}

// スクリプト実行
checkAvailability();
