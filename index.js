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

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );

  const url = "https://reserve.fumotoppara.net/reserved/reserved-calendar-list";
  console.log("アクセス中: カレンダーページ");

  // 最大3回まで再試行
  let retries = 3;
  let success = false;
  let data = [];

  while (retries-- > 0 && !success) {
    await page.goto(url, { waitUntil: "networkidle2" });

    try {
      await page.waitForSelector(".calendar-frame table", { timeout: 10000 });

      data = await page.evaluate(() => {
        const results = [];

        const calendarTable = document.querySelector(".calendar-frame table");
        if (!calendarTable) {
          console.log("⚠️ calendar-table が見つかりません");
          return results;
        }

        const rows = calendarTable.querySelectorAll("tr");
        console.log(`📏 行数: ${rows.length}`);

        if (rows.length <= 1) {
          console.log("⚠️ 行数が1（ヘッダーのみ）のため無効なデータと判断");
          return results;
        }

        let dateHeaders = [];
        rows.forEach((tr, idx) => {
          if (idx === 0) {
            dateHeaders = Array.from(tr.querySelectorAll("th.cell-date")).map((th, index) => {
              const ps = th.querySelectorAll("p");
              const dateText = ps[0]?.innerText.trim(); // 6/14
              const dayOfWeek = ps[1]?.innerText.trim(); // 土
              console.log(`🗓️ ヘッダー[${index}]: ${dateText} (${dayOfWeek})`);
              return { dateText, dayOfWeek };
            });
          }
        });

        rows.forEach((row, rowIndex) => {
          const siteCell = row.querySelector("th.cell-site");
          if (!siteCell || !siteCell.innerText.includes("キャンプ宿泊")) return;

          console.log(`🔍 行[${rowIndex}] チェック: ${siteCell.innerText.trim()}`);
          const cells = row.querySelectorAll("td.cell-date");

          cells.forEach((cell, i) => {
            const status = cell.innerText.trim();
            const header = dateHeaders[i];
            if (!header || !header.dateText || !header.dayOfWeek) {
              console.log(`⚠️ データ不足: index=${i}, header=${JSON.stringify(header)}`);
              return;
            }

            const [monthStr, dayStr] = header.dateText.split("/");
            if (!monthStr || !dayStr) {
              console.log(`⚠️ 日付分解失敗: ${header.dateText}`);
              return;
            }

            const date = `2025-${monthStr.padStart(2, "0")}-${dayStr.padStart(2, "0")}`;
            const isSat = header.dayOfWeek === "土";
            const isAvailable = ["○", "△", "残"].some(s => status.includes(s));

            console.log(
              `→ ${date} (${header.dayOfWeek}) | ステータス: "${status}" | isSat=${isSat} | isAvailable=${isAvailable}`
            );

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
        console.log("🔄 再試行します...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (e) {
      console.error("❌ ページ読み込み失敗:", e.message);
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
