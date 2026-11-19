import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
// 逐页检查：截图（电脑、手机）、返回键、控制台报错；再按真实路径点进点出，量每一步切换耗时
const BASE = process.argv[2]
const PAGES = [
  '/', '/study', '/study/learn', '/study/review', '/study/spell', '/study/lists', '/game', '/vocabulary',
  '/reading', '/listening/keyword', '/listening/corpus', '/reading/daily', '/ielts', '/ielts/guide',
  '/listening/intensive', '/writing', '/speaking', '/grammar', '/mock/listening-test', '/mock/reading-test',
  '/mock/history', '/grading/history', '/mistakes', '/stats', '/settings',
]
const out = { pages: [], flows: [] }
const browser = await chromium.launch()
for (const [w, h, tag] of [[1280, 900, 'desk'], [390, 844, 'phone']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
  for (const path of PAGES) {
    errors.length = 0
    const t0 = Date.now()
    await page.goto(`${BASE}#${path}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(400)
    const info = await page.evaluate(() => {
      const backs = [...document.querySelectorAll('a,button')].filter(e => /^←\s*返回/.test((e.textContent || '').trim()) && e.offsetParent !== null)
      const scrollH = document.documentElement.scrollHeight
      const buttons = [...document.querySelectorAll('main a, main button, #app a, #app button')].filter(e => e.offsetParent !== null && !e.closest('header')).length
      return { backs: backs.map(b => `${(b.textContent || '').trim()} ${b.getAttribute('href') || ''}`), scrollH, buttons, h1: (document.querySelector('h1,h2,h3')?.textContent || '').trim().slice(0, 30) }
    })
    if (tag === 'desk')
      out.pages.push({ path, ms: Date.now() - t0, ...info, errors: [...errors] })
    else out.pages.find(p => p.path === path).phoneScrollH = info.scrollH
    const name = path === '/' ? 'home' : path.slice(1).replace(/\//g, '_')
    await page.screenshot({ path: `shots/${tag}-${name}.png`, fullPage: false })
  }
  await ctx.close()
}
// 真实点进点出：每一步记录从点击到目标内容出现的时间
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${BASE}#/`)
await page.waitForLoadState('networkidle')
async function step(label, action, ready) {
  const t0 = Date.now()
  try {
    await action()
    await ready()
    out.flows.push({ label, ms: Date.now() - t0 })
  }
  catch (e) {
    out.flows.push({ label, ms: -1, error: String(e.message).split('\n')[0].slice(0, 160) })
  }
}
const loc = s => page.locator(s).first()
await step('首页 → 背单词', () => loc('header a[href="#/study"]').click(), () => loc('[data-entry="learn"]').waitFor())
await step('背单词 → 学新词', () => loc('[data-entry="learn"]').click(), () => loc('[data-start]:enabled').waitFor({ timeout: 20000 }))
await step('学新词 开始', () => loc('[data-start]').click(), () => loc('[data-card] [data-word]').waitFor({ timeout: 20000 }))
await step('卡片 自评', () => page.getByRole('button', { name: '不认识', exact: true }).click(), () => loc('[data-study]').waitFor())
await step('卡片 下一个', () => page.getByRole('button', { name: '下一个', exact: true }).click(), () => loc('[data-card] [data-word]').waitFor())
await step('卡片 → 返回选择', () => page.getByRole('button', { name: /返回选择/ }).click(), () => loc('[data-setup]').waitFor())
await step('学新词 → 返回背单词', () => loc('a[data-back]').click(), () => loc('[data-entry="review"]').waitFor())
await step('背单词 → 复习', () => loc('[data-entry="review"]').click(), () => loc('[data-start]').waitFor({ timeout: 30000 }))
await step('复习 → 返回背单词', () => loc('a[data-back]').click(), () => loc('[data-entry="spell"]').waitFor())
await step('背单词 → 练拼写', () => loc('[data-entry="spell"]').click(), () => loc('[data-start]').waitFor({ timeout: 30000 }))
await step('练拼写 开始', () => loc('[data-start]').click(), () => loc('input[aria-label="拼写"]').waitFor())
await step('练拼写 → 返回选择', () => loc('button[data-back]').click(), () => loc('[data-setup]').waitFor())
await step('练拼写 → 返回背单词', () => loc('a[data-back]').click(), () => loc('[data-entry="game"]').waitFor())
await step('背单词 → 单词地牢', () => loc('[data-entry="game"]').click(), () => page.getByRole('button', { name: '进入地牢' }).waitFor({ timeout: 30000 }))
await step('地牢 → 返回背单词', () => loc('a[data-back]').click(), () => loc('[data-more]').waitFor())
await step('背单词 → 查单词表', () => loc('[data-more] a[href="#/vocabulary"]').click(), () => loc('input[id="1"], table').waitFor({ timeout: 20000 }))
await step('词汇表 → 阅读考点词', () => loc('[data-word-tables] a:has-text("阅读考点词")').click(), () => page.getByText('第 1 类考点词').waitFor({ timeout: 20000 }))
await step('阅读考点词 → 听力 179', () => loc('[data-word-tables] a:has-text("听力 179")').click(), () => page.waitForURL(/listening\/keyword/))
await step('查单词表 → 返回背单词', () => loc('[data-word-tables] a[data-back]').click(), () => loc('[data-entry="learn"]').waitFor())
await step('导航 → 每日阅读', () => loc('header a[href="#/reading/daily"]').click(), () => page.getByRole('heading', { name: '每日阅读' }).waitFor({ timeout: 20000 }))
await step('导航 → 雅思考试', () => loc('header a[href="#/ielts"]').click(), () => loc('[data-entry="guide"]').waitFor())
for (const [id, ready] of [['listening', 'a[data-back][href="#/ielts"]'], ['writing', 'a[data-back][href="#/ielts"]'], ['speaking', 'a[data-back][href="#/ielts"]'], ['grammar', 'a[data-back][href="#/ielts"]'], ['guide', 'a[data-back][href="#/ielts"]'], ['mock', 'a[data-back][href="#/ielts"]'], ['records', 'a[data-back][href="#/ielts"]']]) {
  await step(`雅思考试 → ${id}`, () => loc(`[data-entry="${id}"]`).click(), () => loc(ready).waitFor({ timeout: 30000 }))
  await step(`${id} → 返回雅思考试`, () => loc('a[data-back][href="#/ielts"]').click(), () => loc('[data-entry="guide"]').waitFor())
}
await step('导航 → 首页', () => loc('header a[href="#/"]').click(), () => loc('[data-home-entry]').waitFor())
await step('首页 → 错词本', () => loc('[data-today-mistakes]').click(), () => loc('a[data-back][href="#/"]').waitFor())
await step('错词本 → 返回首页', () => loc('a[data-back][href="#/"]').click(), () => loc('[data-home-entry]').waitFor())
await step('首页 → 学习统计', () => loc('[data-home-entry="/stats"]').click(), () => loc('a[data-back][href="#/"]').waitFor())
await step('浏览器后退', () => page.goBack(), () => loc('[data-home-entry]').waitFor())
writeFileSync('shots/audit.json', JSON.stringify(out, null, 1))
await browser.close()
