const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

// 設定部分（必要に応じて.env化してもOK）
const CONFIG = {
  targetDates: ["2025-07-10","2025-07-18", "2025-08-10"], // チェックしたい日を列挙
  keywords: ["○", "△", "残"],               // 空きステータス
  notifyEnabled: true,
  lineAccessToken: process.env.LINE_ACCESS_TOKEN,
  lineUserId: process.env.LINE_USER_ID
};

async function fetchAvailability() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  page.on("console", msg => {
    for (let i = 0; i < msg.args().length; ++i)
      msg.args()[i].jsonValue().then(v => console.log(`🧭 [ブラウザログ] ${v}`));
  });

  page.on("pageerror", err => {
    console.error("🌐 [ページエラー]", err.message);
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );

  const url = "https://reserve.fumotoppara.net/reserved/reserved-calendar-list";
  await page.goto(url, { waitUntil: "domcontentloaded" });

  try {
    await page.waitForFunction(() => {
      const table = document.querySelector(".calendar-frame table");
      return table && table.querySelectorAll("tr").length > 1;
    }, { timeout: 15000 });

    const data = await page.evaluate(() => {
      const results = [];
      const calendarTable = document.querySelector(".calendar-frame table");
      const rows = calendarTable.querySelectorAll("tr");

      let dateHeaders = [];
      rows.forEach((tr, idx) => {
        if (idx === 0) {
          dateHeaders = Array.from(tr.querySelectorAll("th.cell-date")).map((th) => {
            const ps = th.querySelectorAll("p");
            const dateText = ps[0]?.innerText.trim(); // 6/14
            const dayOfWeek = ps[1]?.innerText.trim(); // 曜日
            return { dateText, dayOfWeek };
          });
        }
      });

      rows.forEach((row) => {
        const siteCell = row.querySelector("th.cell-site");
        if (!siteCell || !siteCell.innerText.includes("キャンプ宿泊")) return;

        const cells = row.querySelectorAll("td.cell-date");

        cells.forEach((cell, i) => {
          const status = cell.innerText.trim();
          const header = dateHeaders[i];
          if (!header || !header.dateText) return;

          const [monthStr, dayStr] = header.dateText.split("/");
          const date = `2025-${monthStr.padStart(2, "0")}-${dayStr.padStart(2, "0")}`;
          results.push({ date, status });
        });
      });

      return results;
    });

    await browser.close();
    return data;

  } catch (e) {
    console.error("❌ データ抽出中にエラー:", e.message);
    await page.screenshot({ path: `error_${Date.now()}.png`, fullPage: true });
    await browser.close();
    return [];
  }
}

function filterAvailableDates(data) {
  return data.filter(entry =>
    CONFIG.targetDates.includes(entry.date) &&
    CONFIG.keywords.some(k => entry.status.includes(k))
  );
}

async function sendLine(msg) {
  if (!CONFIG.notifyEnabled) {
    console.log("🔕 LINE通知は無効です");
    return;
  }

  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CONFIG.lineAccessToken}`
    },
    body: JSON.stringify({ to: CONFIG.lineUserId, messages: [{ type: "text", text: msg }] })
  });

  console.log("📨 LINE通知完了");
}

async function main() {
  const rawData = await fetchAvailability();
  const available = filterAvailableDates(rawData);

  console.log("✅ 指定日空き:", available.map(d => `${d.date}(${d.status})`).join(", ") || "なし");

  if (available.length > 0) {
    const msg = "【ふもとっぱら】空きあり：\n" +
                available.map(d => `${d.date}（${d.status}）`).join("\n");
    await sendLine(msg);
  }
}

main();
