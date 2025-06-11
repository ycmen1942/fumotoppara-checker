const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

async function checkAvailability() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  // Puppeteer 内の console.log を Node 側に表示させる
  page.on("console", msg => {
    for (let i = 0; i < msg.args().length; ++i)
      msg.args()[i].jsonValue().then(v => console.log(`🧭 [ブラウザログ] ${v}`));
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );

  console.log("アクセス中: カレンダーページ");
  await page.goto(
    "https://reserve.fumotoppara.net/reserved/reserved-calendar-list",
    { waitUntil: "networkidle2" }
  );

  const data = await page.evaluate(() => {
    const results = [];

    const calendarTable = document.querySelector(".calendar-frame table");
    if (!calendarTable) {
      console.log("⚠️ calendar-table が見つかりません");
      return results;
    }

    const rows = calendarTable.querySelectorAll("tr");
    console.log(`📏 行数: ${rows.length}`);

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
