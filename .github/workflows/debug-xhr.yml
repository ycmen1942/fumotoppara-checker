// debug-fetch.js
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on("request", req => req.continue());
  page.on("response", async res => {
    try {
      const ct = res.headers()["content-type"] || "";
      if (ct.includes("application/json")) {
        const url = res.url();
        const body = await res.text();
        console.log("----");
        console.log("URL :", url);
        console.log("BODY:", body.slice(0, 300).replace(/\n/g, ""));
      }
    } catch (e) {
      // ignore
    }
  });

  console.log("アクセス中: カレンダーページ");
  await page.goto(
    "https://reserve.fumotoppara.net/reserved/reserved-calendar-list",
    { waitUntil: "networkidle2" }
  );

  // ★ setTimeout で 5 秒待機
  await new Promise(resolve => setTimeout(resolve, 5000));

  await browser.close();
})();
