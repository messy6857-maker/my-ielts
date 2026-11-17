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

await step('背单词：从导航进入，各词库的自测都能打开，返回回到背单词', async () => {
  const ctx = await launched.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${BASE}#/grammar`)
  const nav = page.locator('a[href="#/study"]').first()
  await nav.waitFor({ timeout: 20000 })
  // 导航图标确实画出来了（图标名写错的话宽度为 0）
  const icon = await nav.locator('[class*="i-carbon-book"]').first().boundingBox()
  assert.ok(icon && icon.width > 0, '导航图标没有显示')
  assert.equal(await page.locator('a[href="#/game"]').count(), 0)
  await nav.click()
  // 背单词首页：一件事一个入口，没有按词库重复的卡片自测
  await page.locator('[data-entry="learn"]').waitFor()
  assert.equal(await page.locator('[data-entry]').count(), 4)
  assert.equal(await page.getByText('卡片自测 →').count(), 0)
  await page.locator('[data-entry="learn"]').click()
  // 学新词：进来先选，不直接开始
  await page.locator('[data-setup]').waitFor({ timeout: 20000 })
  assert.equal(await page.locator('[data-card]').count(), 0)
  for (const [deck, title] of [['vocabulary', '学新词 · 词汇表'], ['reading538', '学新词 · 阅读考点词'], ['listening179', '学新词 · 听力 179'], ['corpus', '学新词 · 听力语料库']]) {
    await page.locator(`[data-deck-choice="${deck}"]`).click()
    await page.locator('[data-start]:enabled').click()
    await page.getByText(title).first().waitFor({ timeout: 20000 })
    // 统一卡片：自评后看词条，再到下一张
    await page.locator('[data-card] [data-word]').waitFor({ timeout: 20000 })
    await page.getByRole('button', { name: '不认识', exact: true }).click()
    await page.locator('[data-study]').waitFor()
    await page.getByRole('button', { name: '下一个', exact: true }).click()
    await page.locator('[data-card] [data-word]').waitFor()
    // 在自测页里导航仍高亮“背单词”
    assert.ok((await page.locator('a[href="#/study"]').first().getAttribute('class')).includes('text-primary-700'))
    // 返回键回到上一级：选择页
    await page.getByRole('button', { name: /返回选择/ }).first().click()
    await page.getByRole('button', { name: '退出', exact: true }).click()
    await page.locator('[data-setup]').waitFor()
  }
  // 学到什么程度：选“会拼写”，看完词条把词遮住拼一遍
  await page.locator('[data-deck-choice="listening179"]').click()
  await page.locator('[data-practice="spell"]').click()
  await page.locator('[data-start]:enabled').click()
  const spellWord = await page.locator('[data-card] [data-word]').innerText()
  await page.getByRole('button', { name: '不认识', exact: true }).click()
  await page.getByRole('button', { name: '拼一遍', exact: true }).click()
  assert.equal(await page.locator('[data-study-word]').innerText(), '？？？')
  await page.locator('form[data-spell] input').fill(spellWord)
  await page.locator('form[data-spell] input').press('Enter')
  await page.getByText('拼对了 ✓').waitFor()
  await page.getByRole('button', { name: '下一个', exact: true }).click()
  await page.locator('[data-card] [data-word]').waitFor()
  await page.getByRole('button', { name: /返回选择/ }).first().click()
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await page.locator('[data-practice="recognize"]').click()
  await page.locator('[data-deck-choice="corpus"]').click()
  // 选择页的返回键回到背单词；再进学新词，默认还是上次的词库
  await page.locator('a[data-back][href="#/study"]').click()
  await page.locator('[data-entry="learn"]').click()
  await page.locator('[data-deck-choice="corpus"][aria-pressed="true"]').waitFor({ timeout: 20000 })
  // 旧的卡片自测地址跳到学新词，并选好对应词库
  await page.goto(`${BASE}#/reading/flashcard`)
  await page.locator('[data-deck-choice="reading538"][aria-pressed="true"]').waitFor({ timeout: 20000 })
  assert.ok(page.url().includes('deck=reading538'))
  // 新词计数写回原来的阅读考点词记录
  const readingDaily = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('reading538')))
  assert.ok(readingDaily.length > 0, '阅读考点词没有写回原记录')
  // 复习到期的词：刚才四个词库各有一个“不认识”的词已经到期。进来先选，默认勾上有到期词的词库
  await page.goto(`${BASE}#/study`)
  await page.locator('[data-entry="review"] [data-badge]').waitFor()
  await page.locator('[data-entry="review"]').click()
  await page.locator('[data-start]:enabled').waitFor({ timeout: 30000 })
  assert.equal(await page.locator('[data-card]').count(), 0)
  assert.equal(await page.locator('[data-review-deck]:checked').count(), 4)
  assert.ok((await page.locator('[data-preview]').innerText()).includes('这一轮复习 4 个'))
  // 自定义数量：只复习 2 个
  await page.locator('[data-count="custom"]').click()
  await page.locator('input[aria-label="自定义数量"]').fill('2')
  await page.locator('input[aria-label="自定义数量"]').press('Tab')
  await page.getByText('这一轮复习 2 个').waitFor()
  await page.locator('[data-start]').click()
  // 每个词注明来自哪个词库
  await page.locator('[data-card] [data-deck-label]').waitFor()
  assert.ok((await page.locator('[data-deck-label]').innerText()).startsWith('来自 '))
  assert.ok((await page.locator('a[href="#/study"]').first().getAttribute('class')).includes('text-primary-700'))
  await page.getByRole('button', { name: '认识', exact: true }).click()
  await page.locator('[data-study]').waitFor()
  await page.getByRole('button', { name: '下一个', exact: true }).click()
  await page.locator('[data-card] [data-word]').waitFor()
  // 返回选择页：少了一个到期的词；再返回背单词
  await page.getByRole('button', { name: /返回选择/ }).first().click()
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await page.locator('[data-setup]').waitFor()
  await page.getByText('选中的词库一共 3 个到期').waitFor()
  await page.locator('a[data-back][href="#/study"]').click()
  await page.locator('[data-entry="review"]').waitFor()
  // 旧的词汇表单词自测地址：到期复习跳到复习页，其余跳到学新词
  await page.goto(`${BASE}#/vocabulary/flashcard?review=due`)
  await page.getByRole('heading', { name: '复习到期的词' }).waitFor({ timeout: 20000 })
  await page.goto(`${BASE}#/vocabulary/flashcard`)
  await page.locator('[data-deck-choice="vocabulary"][aria-pressed="true"]').waitFor({ timeout: 20000 })
  // 练拼写：进来先选词源、练法、数量，点开始才出题
  await page.goto(`${BASE}#/study`)
  await page.locator('[data-entry="spell"]').click()
  await page.locator('[data-start]').waitFor({ timeout: 30000 })
  assert.equal(await page.locator('[data-question]').count(), 0)
  assert.ok((await page.locator('a[href="#/study"]').first().getAttribute('class')).includes('text-primary-700'))
  // 语料库、看义拼写：拼错一个，看到标出的字母；返回选择
  await page.locator('[data-source="corpus"]').click()
  await page.locator('[data-mode="meaning"]').click()
  await page.locator('[data-size="10"]').click()
  await page.locator('[data-start]').click()
  await page.locator('input[aria-label="拼写"]').fill('zzzz')
  await page.locator('input[aria-label="拼写"]').press('Enter')
  await page.locator('[data-answer] [data-diff]').waitFor()
  await page.keyboard.press('Enter')
  await page.locator('input[aria-label="拼写"]:enabled').waitFor()
  await page.locator('button[data-back]').click()
  await page.locator('[data-setup]').waitFor()
  // 刚才拼错的词进了“拼错过的词”
  assert.ok((await page.locator('[data-source="mistakes"]').innerText()).includes('（'))
  assert.ok(!(await page.locator('[data-source="mistakes"]').innerText()).includes('（0）'))
  // 词汇表、跟打：照着打完一个词自动到下一个
  await page.locator('[data-source="vocabulary"]').click()
  await page.locator('[data-mode="typing"]').click()
  await page.locator('[data-start]').click()
  const target = await page.locator('[data-target]').innerText()
  await page.locator('input[aria-label="拼写"]').pressSequentially(target)
  await page.getByText('2 / 10').waitFor()
  await page.locator('button[data-back]').click()
  // 听力 179、带同义替换：两个输入框
  await page.locator('[data-source="listening179"]').click()
  await page.locator('[data-mode="synonym"]').click()
  await page.locator('[data-start]').click()
  await page.locator('input[aria-label="同义替换"]').waitFor()
  await page.locator('input[aria-label="拼写"]').fill('zzzz')
  await page.locator('input[aria-label="拼写"]').press('Enter')
  assert.equal(await page.locator('[data-answer]').count(), 0)
  await page.locator('input[aria-label="同义替换"]').press('Enter')
  await page.locator('[data-answer]').waitFor()
  await page.locator('button[data-back]').click()
  // 选择页返回背单词
  await page.locator('a[data-back][href="#/study"]').click()
  await page.locator('[data-entry="spell"]').waitFor()
  // 旧的练习页地址跳到练拼写，并选好词源和练法
  await page.goto(`${BASE}#/listening/179practice`)
  await page.locator('[data-mode="synonym"][aria-pressed="true"]').waitFor({ timeout: 30000 })
  await page.goto(`${BASE}#/vocabulary/typing`)
  await page.locator('[data-mode="typing"][aria-pressed="true"]').waitFor({ timeout: 30000 })
  assert.equal(await page.locator('[data-source="vocabulary"]').getAttribute('aria-pressed'), 'true')
  await page.goto(`${BASE}#/listening/corpus-spelling`)
  await page.locator('[data-source="corpus"][aria-pressed="true"]').waitFor({ timeout: 30000 })
  // 词表的练习模式还在，从练拼写能打开，也能返回
  await page.locator('[data-source="vocabulary"]').click()
  await page.getByRole('link', { name: '打开词表的练习模式' }).click()
  await page.locator('input[id="1"]').waitFor({ timeout: 20000 })
  await page.locator('a[data-back][href="#/study/spell"]').waitFor()
  assert.equal(await page.getByRole('link', { name: '自测卡片' }).count(), 0)
  assert.deepEqual(errors, [])
  await ctx.close()
})

await step('单词地牢：从背单词进入，选章节开局，一路作答到结算，没有报错', async () => {
  const ctx = await launched.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${BASE}#/study`)
  await page.locator('[data-entry="game"]').click()
  // 地牢选词页能返回背单词
  await page.locator('a[data-back][href="#/study"]').click()
  await page.locator('[data-entry="game"]').click()
  await page.getByRole('button', { name: '进入地牢' }).waitFor({ timeout: 20000 })
  assert.ok(await page.getByRole('button', { name: '进入地牢' }).isDisabled())
  await page.locator('button[data-chapter]').first().click()
  await page.getByRole('button', { name: '进入地牢' }).click()
  await page.getByText('房间 1 / 5').waitFor()
  for (let i = 0; i < 40; i++) {
    if (await page.getByRole('button', { name: '再来一局' }).count())
      break
    if (await page.locator('button[data-relic]').count()) {
      await page.keyboard.press('1')
      await sleep(50)
      continue
    }
    const input = page.locator('input[aria-label="拼写"]')
    if (await input.count()) {
      await input.fill('zzzz')
      await input.press('Enter')
    }
    else {
      await page.keyboard.press('1')
    }
    await page.getByRole('button', { name: /^(继续|查看结果)$/ }).waitFor()
    await page.keyboard.press('Enter')
    await sleep(50)
  }
  await page.getByRole('button', { name: '再来一局' }).waitFor()
  const text = await page.locator('main, body').first().innerText()
  assert.ok(/通关|倒在了第 \d+ 层/.test(text))
  // 再来一局能直接开打；刷新后记得上次选的章节
  await page.getByRole('button', { name: '再来一局' }).click()
  await page.getByText('房间 1 /').waitFor()
  await page.reload()
  await page.getByRole('button', { name: '进入地牢' }).waitFor({ timeout: 20000 })
  assert.equal(await page.locator('button[data-chapter][aria-pressed="true"]').count(), 1)
  // 每日地牢、词单编辑、考点词库
  await page.locator('[data-daily] button').click()
  await page.getByText('每日地牢 · 第 1 / 3 层').waitFor()
  await page.reload()
  await page.getByRole('button', { name: '进入地牢' }).waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: '编辑词单' }).click()
  await page.locator('input[type="search"]').fill('atmos')
  await page.locator('button[data-search-result]').first().click()
  await page.getByText('我的词单（1）').waitFor()
  await page.locator('button[data-deck="reading538"]').click()
  await page.locator('button[data-mode="endless"]').click()
  await page.getByRole('button', { name: '进入地牢' }).click()
  await page.getByText('第 1 层 · 房间 1 / 5').waitFor()
  assert.deepEqual(errors, [])
  await ctx.close()
})

await browser.close()
console.log(results.join('\n'))
if (results.some(r => !r.startsWith('PASS')))
  process.exit(1)
