// debug-fetch.js
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on("request", req => req.continue());
  page.on("response", async res => {
    try {
      const url = res.url();
      if (res.headers()["content-type"]?.includes("application/json")) {
        const body = await res.text();
        console.log("----");
        console.log("URL:", url);
        console.log("BODY:", body.slice(0, 300).replace(/\n/g, ""));
      }
    } catch (e) {}
  });

  console.log("アクセス中: カレンダーページ");
  await page.goto(
    "https://reserve.fumotoppara.net/reserved/reserved-calendar-list",
    { waitUntil: "networkidle2" }
  );

  await page.waitForTimeout(5000);
  await browser.close();
})();
