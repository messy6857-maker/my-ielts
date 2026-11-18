import { chromium } from 'playwright'
const BASE = process.argv[2]
const browser = await chromium.launch()
for (const [w, h, tag] of [[1280, 900, 'desk'], [390, 844, 'phone']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  for (const [path, name] of [['/', 'home'], ['/ielts', 'ielts'], ['/ielts/guide?part=reading', 'guide'], ['/study', 'study'], ['/reading', 'tables'], ['/listening/intensive', 'intensive']]) {
    await page.goto(`${BASE}#${path}`)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `shots/${tag}-${name}.png`, fullPage: false })
  }
  await page.close()
}
await browser.close()
