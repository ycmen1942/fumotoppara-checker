const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

async function checkAvailability() {
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
  console.log("アクセス中: カレンダーページ");

  let retries = 3;
  let success = false;
  let data = [];

  while (retries-- > 0 && !success) {
    await page.goto(url, { waitUntil: "domcontentloaded" });

    try {
      // 行数が2以上になるまで待機
      await page.waitForFunction(() => {
        const table = document.querySelector(".calendar-frame table");
        return table && table.querySelectorAll("tr").length > 1;
      }, { timeout: 15000 });

      data = await page.evaluate(() => {
        const results = [];
        const calendarTable = document.querySelector(".calendar-frame table");
        const rows = calendarTable.querySelectorAll("tr");

        let dateHeaders = [];
        rows.forEach((tr, idx) => {
          if (idx === 0) {
            dateHeaders = Array.from(tr.querySelectorAll("th.cell-date")).map((th, index) => {
              const ps = th.querySelectorAll("p");
              const dateText = ps[0]?.innerText.trim();
              const dayOfWeek = ps[1]?.innerText.trim();
              console.log(`🗓️ ヘッダー[${index}]: ${dateText} (${dayOfWeek})`);
              return { dateText, dayOfWeek };
            });
          }
        });

        rows.forEach((row, rowIndex) => {
          const siteCell = row.querySelector("th.cell-site");
          if (!siteCell || !siteCell.innerText.includes("キャンプ宿泊")) return;

          const cells = row.querySelectorAll("td.cell-date");

          cells.forEach((cell, i) => {
            const status = cell.innerText.trim();
            const header = dateHeaders[i];
            if (!header || !header.dateText || !header.dayOfWeek) return;

            const [monthStr, dayStr] = header.dateText.split("/");
            const date = `2025-${monthStr.padStart(2, "0")}-${dayStr.padStart(2, "0")}`;
            const isSat = header.dayOfWeek === "土";
            const isAvailable = ["○", "△", "残"].some(s => status.includes(s));

            if (isSat && isAvailable) {
              results.push({ date, status });
            }
          });
        });

        return results;
      });

      if (data.length > 0 || retries === 0) {
        success = true;
      } else {
        console.log("🔄 データが空、再試行します...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (e) {
      console.error("❌ ページ処理中にエラー:", e.message);
      await page.screenshot({ path: `error_${Date.now()}.png`, fullPage: true });
      console.log("📸 スクリーンショット保存しました");
    }
  }

  await browser.close();

  const available = data.map(d => d.date);
  console.log("✅ 土曜空き候補:", available.join(", ") || "なし");

  if (available.length) {
    await sendLine("【ふもとっぱら】土曜に空きあり！\n" + available.join("\n"));
  }
}

async function sendLine(msg) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ to: LINE_USER_ID, messages: [{ type: "text", text: msg }] })
  });
  console.log("📨 LINE通知完了");
}

checkAvailability();
