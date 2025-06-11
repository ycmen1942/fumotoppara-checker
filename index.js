const data = await page.evaluate(() => {
  const results = [];

  const calendarTable = document.querySelector(".calendar-frame table");
  if (!calendarTable) {
    console.log("⚠️ calendar-table が見つかりません");
    return results;
  }

  const rows = calendarTable.querySelectorAll("tr");

  let dateHeaders = [];
  rows.forEach((tr, idx) => {
    if (idx === 0) {
      dateHeaders = Array.from(tr.querySelectorAll("th.cell-date")).map((th, index) => {
        const ps = th.querySelectorAll("p");
        const dateText = ps[0]?.innerText.trim(); // 6/14
        const dayOfWeek = ps[1]?.innerText.trim(); // 土
        console.log(`📅 ヘッダー${index}: ${dateText} (${dayOfWeek})`);
        return { dateText, dayOfWeek };
      });
    }
  });

  rows.forEach((row, rowIndex) => {
    const siteCell = row.querySelector("th.cell-site");
    if (!siteCell || !siteCell.innerText.includes("キャンプ宿泊")) return;

    console.log(`🔍 チェック対象 row[${rowIndex}] - ${siteCell.innerText.trim()}`);
    const cells = row.querySelectorAll("td.cell-date");

    cells.forEach((cell, i) => {
      const status = cell.innerText.trim();
      const header = dateHeaders[i];
      if (!header || !header.dateText || !header.dayOfWeek) {
        console.log(`⚠️ データ欠落: index=${i}, header=${JSON.stringify(header)}`);
        return;
      }

      const [monthStr, dayStr] = header.dateText.split("/");
      if (!monthStr || !dayStr) {
        console.log(`⚠️ 日付パース失敗: ${header.dateText}`);
        return;
      }

      const date = `2025-${monthStr.padStart(2, "0")}-${dayStr.padStart(2, "0")}`;
      const isSat = header.dayOfWeek === "土";
      const isAvailable = ["○", "△", "残"].some(s => status.includes(s));

      console.log(
        `→ 判定対象: ${date} (${header.dayOfWeek}) | 状態=${status} | isSat=${isSat} | isAvailable=${isAvailable}`
      );

      if (isSat && isAvailable) {
        results.push({ date, status });
      }
    });
  });

  return results;
});
