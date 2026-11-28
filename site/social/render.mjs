// Renders preview.html to preview.png (1280×640), the image uploaded in
// the repo's Settings → General → Social preview. Run from the repo root:
//   node site/social/render.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const here = new URL(".", import.meta.url);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await page.goto(new URL("preview.html", here).href);
await page.screenshot({ path: fileURLToPath(new URL("preview.png", here)) });
await browser.close();
