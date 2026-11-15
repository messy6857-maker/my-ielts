// 真实浏览器多页签验证（Playwright + Chromium）。
// 用法：先 `pnpm build && pnpm preview --port 4173`，再在装了 playwright 的目录里运行
//   node e2e-browser.mjs http://localhost:4173/
// 同一个 BrowserContext 里的页签共享 localStorage，并真实收发 storage 事件。
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:4173/'
const PAGE = `${BASE}#/grammar`
const STATIC = `${BASE}404.svg` // 同源、但不运行网站代码：模拟只会整表写旧表的旧版页签
const LEGACY = 'myielts_page_bookmarks_v1'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []

async function step(name, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push(`PASS ${name} (${Date.now() - started}ms)`)
  }
  catch (e) {
    results.push(`FAIL ${name}: ${e.stack ?? e}`)
  }
}

async function openApp(ctx, url = PAGE) {
  const page = await ctx.newPage()
  page.on('pageerror', e => results.push(`PAGEERROR ${url}: ${e.message}`))
  await page.goto(url)
  await page.waitForSelector('button[aria-label="增加书签"]', { timeout: 20000 })
  // 让页面足够长，滚动位置可以各不相同
  await page.evaluate(() => { document.body.style.minHeight = '400000px' })
  return page
}
const bookmarkCount = page => page.locator('button[aria-label^="删除书签"]').count()

/** 按新版规则算出存储里“应显示”的 /grammar 书签 id（v2 单条 key，加上旧表里没处理过的） */
async function visibleIds(page) {
  return page.evaluate((LEGACY) => {
    const ids = new Set()
    const path = encodeURIComponent('/grammar')
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(`myielts_page_bookmark_v2:${path}|`))
        ids.add(decodeURIComponent(k.split('|')[1]))
    }
    const list = new Set(JSON.parse(localStorage.getItem('myielts_page_bookmark_v2_migrated') ?? '[]'))
    const table = JSON.parse(localStorage.getItem(LEGACY) ?? '{}')
    for (const item of table['/grammar'] ?? []) {
      const done = localStorage.getItem(`myielts_page_bookmark_v2_done:${path}|${encodeURIComponent(item.id)}`) !== null
        || list.has(`myielts_page_bookmark_v2:${path}|${encodeURIComponent(item.id)}`)
      if (!done)
        ids.add(item.id)
    }
    return [...ids].sort()
  }, LEGACY)
}

const launched = await chromium.launch()
// 书签列表从右下角往上堆，窗口要够高才能点到最上面的
const browser = { newContext: () => launched.newContext({ viewport: { width: 1280, height: 7000 } }), close: () => launched.close() }

await step('两个新版页签同时加书签，30 次并发全部保留且互相同步', async () => {
  const ctx = await browser.newContext()
  const [p1, p2] = [await openApp(ctx), await openApp(ctx)]
  const rounds = 15
  for (let i = 0; i < rounds; i++) {
    await p1.evaluate(y => window.scrollTo(0, y), 1000 + i * 1000)
    await p2.evaluate(y => window.scrollTo(0, y), 1500 + i * 1000)
    await Promise.all([
      p1.click('button[aria-label="增加书签"]'),
      p2.click('button[aria-label="增加书签"]'),
    ])
  }
  await sleep(500)
  const keys = await p1.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('myielts_page_bookmark_v2:')).length)
  assert.equal(keys, rounds * 2)
  assert.equal(await bookmarkCount(p1), rounds * 2)
  assert.equal(await bookmarkCount(p2), rounds * 2)
  await ctx.close()
})

await step('旧版页签持续整表写入，同时两个新版页签迁移并删除：新增不丢、删除不复活', async () => {
  const ctx = await browser.newContext()
  const old = await ctx.newPage()
  await old.goto(STATIC)
  await old.evaluate(LEGACY => localStorage.setItem(LEGACY, JSON.stringify({ '/grammar': [] })), LEGACY)
  const [p1, p2] = [await openApp(ctx), await openApp(ctx)]
  const TOTAL = 120
  const DELETES = 40
  // 旧版页签：内存里一份快照，每次加一条后整表写回（旧版的写法），始终带着它以为还在的所有条目
  const oldWriting = old.evaluate(async ({ LEGACY, TOTAL }) => {
    const snapshot = []
    for (let k = 1; k <= TOTAL; k++) {
      snapshot.push({ id: `old-${String(k).padStart(3, '0')}`, y: 100000 + k * 200, createdAt: k })
      localStorage.setItem(LEGACY, JSON.stringify({ '/grammar': snapshot }))
      await new Promise(r => setTimeout(r, 15))
    }
    // 结束后再用过期快照写回几次（带着已被新版删除的条目）
    for (let i = 0; i < 5; i++) {
      localStorage.setItem(LEGACY, JSON.stringify({ '/grammar': snapshot }))
      await new Promise(r => setTimeout(r, 30))
    }
  }, { LEGACY, TOTAL })
  // 新版页签 1：等旧条目陆续出现，从最上面一条开始删
  const deleting = (async () => {
    for (let d = 0; d < DELETES; d++) {
      await p1.waitForSelector('button[aria-label="删除书签 1"]')
      await p1.click('button[aria-label="删除书签 1"]')
      await sleep(20)
    }
  })()
  await Promise.all([oldWriting, deleting])
  await sleep(500)
  const expected = []
  for (let k = DELETES + 1; k <= TOTAL; k++)
    expected.push(`old-${String(k).padStart(3, '0')}`)
  assert.deepEqual(await visibleIds(p1), expected)
  assert.equal(await bookmarkCount(p1), TOTAL - DELETES)
  assert.equal(await bookmarkCount(p2), TOTAL - DELETES)
  // 刷新后仍一致
  await p2.reload()
  await p2.waitForSelector('button[aria-label="增加书签"]')
  assert.equal(await bookmarkCount(p2), TOTAL - DELETES)
  await ctx.close()
})

await step('新版从不删除或改写旧表，删除旧表来源的书签只写删除记录，其他页签跟着更新', async () => {
  const ctx = await browser.newContext()
  const old = await ctx.newPage()
  await old.goto(STATIC)
  const table = JSON.stringify({ '/grammar': [{ id: 'a', y: 100, createdAt: 1 }, { id: 'b', y: 900, createdAt: 2 }] })
  await old.evaluate(([LEGACY, table]) => localStorage.setItem(LEGACY, table), [LEGACY, table])
  const p1 = await openApp(ctx)
  await p1.click('button[aria-label="删除书签 1"]')
  await sleep(200)
  assert.equal(await p1.evaluate(LEGACY => localStorage.getItem(LEGACY), LEGACY), table)
  assert.equal(await bookmarkCount(p1), 1)
  const p2 = await openApp(ctx)
  assert.equal(await bookmarkCount(p2), 1)
  await p1.click('button[aria-label="删除书签 1"]')
  await sleep(300)
  assert.equal(await bookmarkCount(p2), 0)
  await ctx.close()
})

await step('其他页签打开了新版本：旧页签显示刷新提示', async () => {
  const ctx = await browser.newContext()
  const p1 = await openApp(ctx)
  assert.equal(await p1.getByText('网站已更新').count(), 0)
  const other = await ctx.newPage()
  await other.goto(STATIC)
  await other.evaluate(() => localStorage.setItem('myielts_app_build', String(Number.MAX_SAFE_INTEGER)))
  await p1.getByText('网站已更新').waitFor({ timeout: 5000 })
  await ctx.close()
})

await step('设置页：先粘贴新 Key 再逐字输入地址，Key 被清空且不顶替已保存的 Key', async () => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('pageerror', e => results.push(`PAGEERROR settings: ${e.message}`))
  await page.goto(`${BASE}#/settings`)
  const address = page.locator('input[placeholder="https://api-cdn.thehive.ai/api/v3"]')
  const key = page.locator('input[placeholder="sk-..."]')
  await address.waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: 'OpenAI', exact: true }).click()
  await key.fill('sk-fake-saved')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await key.fill('sk-fake-pasted')
  await address.fill('')
  await address.pressSequentially('https://b.example.com/v1', { delay: 5 })
  assert.equal(await key.inputValue(), '')
  await page.getByRole('button', { name: 'OpenAI', exact: true }).click()
  assert.equal(await key.inputValue(), 'sk-fake-saved')
  // 自定义地址填 Key、切走再切回来能恢复
  await address.fill('')
  await address.pressSequentially('https://c.example.com/v1', { delay: 5 })
  await key.fill('sk-fake-c')
  await page.getByRole('button', { name: 'OpenAI', exact: true }).click()
  await address.fill('')
  await address.pressSequentially('https://c.example.com/v1', { delay: 5 })
  assert.equal(await key.inputValue(), 'sk-fake-c')
  // 清空已保存的 Key，切到 Hive 保存，再切回来：仍是空的
  await page.getByRole('button', { name: 'OpenAI', exact: true }).click()
  assert.equal(await key.inputValue(), 'sk-fake-saved')
  await key.fill('')
  await page.getByRole('button', { name: 'Hive', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('button', { name: 'OpenAI', exact: true }).click()
  assert.equal(await key.inputValue(), '')
  await ctx.close()
})

await browser.close()
console.log(results.join('\n'))
if (results.some(r => !r.startsWith('PASS')))
  process.exit(1)
