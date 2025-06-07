// index.js
const fetch = require("node-fetch");

// LINE 通知設定
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID      = process.env.LINE_USER_ID;

// API エンドポイントと取得期間（必要に応じて変更）
const API_URL   = "https://reserve.fumotoppara.net/api/shared/reserve/calendars";
const START     = "2025-06-01";
const END       = "2025-09-30";

// 通知対象の月と曜日
const TARGET_MONTHS  = [6, 7, 8];    // 1 月基準で指定：6月〜8月
const TARGET_WEEKDAYS = [5, 6];      // 金曜=5, 土曜=6

async function checkAvailability() {
  // ① JSON API を POST で取得
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: START, endDate: END }),
  });
  if (!res.ok) {
    console.error("API エラー:", res.status, await res.text());
    return;
  }
  const data = await res.json();

  // ② 「キャンプ宿泊」プランのデータを取得
  const stayPlan = data.calendarsSiteList.find(
    item => item.stayDiv === "STAY" && item.siteName.includes("キャンプ宿泊")
  );
  if (!stayPlan) {
    console.error("キャンプ宿泊プランが見つかりません");
    return;
  }

  // ③ 日付ごとのステータス配列を取得（例: stayPlan.calendarDates）
  //    ※ 実際のキー名はレスポンス JSON をご確認ください。
  const dates = stayPlan.calendarDates || stayPlan.dates;
  if (!Array.isArray(dates)) {
    console.error("日付データの形式が不明です：", Object.keys(stayPlan));
    return;
  }

  // ④ 空き（○△残）の日付だけ抽出
  const available = dates
    .filter(d => ["○", "△", "残"].includes(d.status))
    .map(d => d.date);  // date は "2025-06-13" のような文字列

  console.log("API 検出された空き日:", available.join(", "));

  // ⑤ 金曜・土曜かつ対象月のみフィルタ
  const target = available.filter(str => {
    const d = new Date(str);
    return (
      TARGET_MONTHS.includes(d.getMonth() + 1) &&
      TARGET_WEEKDAYS.includes(d.getDay())
    );
  });

  console.log("対象（金・土）:", target.join(", ") || "なし");

  // ⑥ LINE へ通知
  if (target.length > 0) {
    const msg = `【ふもとっぱら】6〜8月の金・土に空きあり！\n` + target.join("\n");
    await sendLine(msg);
  } else {
    console.log("通知対象なし。スキップ。");
  }
}

async function sendLine(message) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to: LINE_USER_ID, messages: [{ type: "text", text: message }] }),
  });
  if (!res.ok) {
    console.error("LINE通知エラー:", res.status, await res.text());
  } else {
    console.log("LINE通知完了");
  }
}

checkAvailability();
