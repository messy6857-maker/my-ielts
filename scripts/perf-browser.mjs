// 真实浏览器点击耗时测量（Playwright + Chromium）。
// 用法：vite build --minify false 后 vite preview --port 4175，再 node perf-browser.mjs http://localhost:4175/
// 每个页面依次点击可见的安全按钮/链接，用 Event Timing 记录“点击 → 画面更新”的耗时；
// 分别在空存储和“长期使用”量级的存储下测，并抓 CPU 热点函数。
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:4175/'
const ROUTES = ['/', '/vocabulary', '/vocabulary/flashcard', '/vocabulary/typing', '/grammar', '/reading', '/reading/daily', '/reading/flashcard', '/listening', '/listening/179practice', '/listening/flashcard', '/listening/corpus', '/listening/intensive', '/speaking', '/writing', '/mistakes', '/stats', '/settings', '/ielts', '/grading/history', '/mock/history']
const UNSAFE = /删除|清空|退出|重置|注销|登录|注册|导出|导入|恢复|认领|丢弃|上传|下载|录音|开始考试|交卷/
const CLICKS_PER_ROUTE = 10

/** 长期使用的游客数据：大量单词复习记录、错题、每日记录、书签 */
function seed() {
  const now = Date.now()
  const env = (value, i) => JSON.stringify({ __ielts: 2, stamp: [now - i * 1000, 'seed-actor'], value })
  const hex = id => id.split('').map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')
  const put = (base, id, value, i) => localStorage.setItem(`myielts_${base}__entry_${hex(id)}`, env(value, i))
  const bases = ['sr_vocabulary_v1', 'corpus_sr_v1', 'listening179_sr_v1', 'reading538_sr_v1', 'mistake_parts_v2', 'daily_parts_v2', 'mistake_resets_v2', 'daily_resets_v2', 'progress_v1', 'vocabulary_spell_v2', 'stats_parts_v2', 'timer_sessions_v2', 'flashcard_checkin_v1', 'checkin_years_v2']
  for (const base of bases)
    localStorage.setItem(`myielts_local_migrated:myielts_${base}`, '1')
  const schedule = i => ({ ease: 2.5, interval: 1 + (i % 30), dueAt: now + ((i % 60) - 30) * 86400000, reps: i % 5, lapses: i % 3 })
  for (let i = 0; i < 8000; i++) put('sr_vocabulary_v1', `word${i}`, schedule(i), i)
  for (const base of ['corpus_sr_v1', 'listening179_sr_v1', 'reading538_sr_v1']) {
    for (let i = 0; i < 2000; i++) put(base, `item${i}`, schedule(i), i)
  }
  for (let i = 0; i < 1500; i++) {
    put('mistake_parts_v2', `seed-actor|vocabulary:word${i}`, {
      key: `vocabulary:word${i}`,
      module: 'vocabulary',
      title: `word${i}`,
      detail: `释义 ${i}`,
      count: 1 + (i % 4),
      firstAt: now - i * 3600000,
      lastAt: now - i * 60000,
      epoch: '',
      days: { [new Date(now - (i % 30) * 86400000).toISOString().slice(0, 10)]: 1 },
      recordedAttempts: [{ id: `a${i}`, at: now - i * 60000 }],
    }, i)
  }
  for (let i = 0; i < 365 * 4; i++) {
    const date = new Date(now - Math.floor(i / 4) * 86400000).toISOString().slice(0, 10)
    const ns = ['flashcard', 'listening179', 'reading538', 'corpus'][i % 4]
    put('daily_parts_v2', `${ns}|${date}|seed-actor`, { ns, date, word: null, count: 5 + (i % 20), actor: 'seed-actor', epoch: '' }, i)
  }
  for (let i = 0; i < 60; i++)
    localStorage.setItem(`myielts_page_bookmark_v2:${encodeURIComponent('/grammar')}|seed${i}`, JSON.stringify({ id: `seed${i}`, y: i * 300, createdAt: i }))
  return Object.keys(localStorage).length
}

async function measureRoute(ctx, route, seeded) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const t0 = Date.now()
  await page.goto(`${BASE}#${route}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  const loadMs = Date.now() - t0
  const labels = await page.evaluate((UNSAFE) => {
    const re = new RegExp(UNSAFE)
    const out = []
    for (const el of document.querySelectorAll('main button, main a, button, a[href^="#/"]')) {
      const r = el.getBoundingClientRect()
      const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)
      if (!text || r.width === 0 || r.height === 0 || el.disabled || re.test(text) || out.includes(text))
        continue
      out.push(text)
    }
    return out
  }, UNSAFE.source)
  const clicks = []
  for (const label of labels.slice(0, CLICKS_PER_ROUTE)) {
    await page.goto(`${BASE}#${route}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.evaluate(() => {
      window.__ev = []
      new PerformanceObserver(list => list.getEntries().forEach(e => window.__ev.push({ name: e.name, d: e.duration }))).observe({ type: 'event', durationThreshold: 16, buffered: false })
      window.__lt = 0
      new PerformanceObserver(list => list.getEntries().forEach((e) => { window.__lt += e.duration })).observe({ type: 'longtask' })
    })
    const target = page.locator('button, a').filter({ hasText: label }).first()
    const byLabel = page.locator(`[aria-label="${label.replace(/"/g, '\\"')}"]`).first()
    const el = (await byLabel.count()) ? byLabel : target
    try {
      await el.click({ timeout: 2000, noWaitAfter: true })
    }
    catch {
      continue
    }
    await page.waitForTimeout(700)
    const r = await page.evaluate(() => ({ ev: Math.max(0, ...window.__ev.filter(e => /click|pointer/.test(e.name)).map(e => e.d)), lt: window.__lt }))
    clicks.push({ label, ...r })
  }
  await page.close()
  return { route, seeded, loadMs, clicks, errors }
}


/** 抓一次点击的 CPU 热点：先打开 from，再点 label，记录随后 3 秒内的采样 */
async function profileClick(ctx, from, label, title) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}#${from}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(500)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 })
  await cdp.send('Profiler.start')
  const t0 = Date.now()
  await page.locator('a, button').filter({ hasText: label }).first().click({ noWaitAfter: true })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1500)
  const { profile } = await cdp.send('Profiler.stop')
  const self = new Map()
  const total = new Map()
  const byId = new Map(profile.nodes.map(n => [n.id, n]))
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const nameOf = (n) => {
    const f = n.callFrame
    return `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`
  }
  profile.samples.forEach((id, i) => {
    const ms = (profile.timeDeltas[i] ?? 0) / 1000
    const n = byId.get(id)
    self.set(nameOf(n), (self.get(nameOf(n)) ?? 0) + ms)
    const seen = new Set()
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const nm = nameOf(byId.get(cur))
      if (seen.has(nm))
        continue
      seen.add(nm)
      total.set(nm, (total.get(nm) ?? 0) + ms)
    }
  })
  const skip = /^\((idle|program|root)\)/
  console.log(`\n--- ${title}（点击后 ${Date.now() - t0}ms 内）---`)
  console.log('自身耗时最多：')
  for (const [n, ms] of [...self].filter(([n]) => !skip.test(n)).sort((a, b) => b[1] - a[1]).slice(0, 15))
    console.log(`  ${ms.toFixed(0).padStart(6)}ms  ${n}`)
  console.log('含子调用耗时最多：')
  for (const [n, ms] of [...total].filter(([n]) => !skip.test(n)).sort((a, b) => b[1] - a[1]).slice(0, 25))
    console.log(`  ${ms.toFixed(0).padStart(6)}ms  ${n}`)
  await page.close()
}
const browser = await chromium.launch()
const report = []
/** 一次点击里脚本、样式计算、排版各花了多久（CDP Performance 指标差值），以及新页面的 DOM 节点数 */
async function renderCost(ctx, from, label, title) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}#${from}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(500)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable')
  const read = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
  await page.evaluate(() => {
    window.__lt = 0
    window.__ltMax = 0
    new PerformanceObserver(list => list.getEntries().forEach((e) => {
      window.__lt += e.duration
      window.__ltMax = Math.max(window.__ltMax, e.duration)
    })).observe({ type: 'longtask' })
  })
  const a = await read()
  await page.locator('a, button').filter({ hasText: label }).first().click({ noWaitAfter: true })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1500)
  const b = await read()
  const ms = k => Math.round((b[k] - a[k]) * 1000)
  const nodes = await page.evaluate(() => document.querySelectorAll('*').length)
  const lt = await page.evaluate(() => [Math.round(window.__lt), Math.round(window.__ltMax)])
  console.log(`${title}：长任务合计 ${lt[0]}ms（最长一次 ${lt[1]}ms）；总任务 ${ms('TaskDuration')}ms = 脚本 ${ms('ScriptDuration')}ms + 样式 ${ms('RecalcStyleDuration')}ms + 排版 ${ms('LayoutDuration')}ms + 其他；页面元素 ${nodes} 个`)
  await page.close()
}
if (process.env.TARGETED) {
  for (const seeded of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const setup = await ctx.newPage()
    await setup.goto(`${BASE}404.svg`)
    if (seeded)
      await setup.evaluate(seed)
    await setup.close()
    const tag = seeded ? '长期数据' : '空存储'
    for (const [label, name] of [['阅读', '阅读'], ['错词本', '错词本'], ['首页', '首页'], ['词汇', '词汇'], ['听力', '听力']])
      await renderCost(ctx, '/grammar', label, `${tag}：语法页点“${name}”`)
    if (process.env.TARGETED === 'cost') {
      await ctx.close()
      continue
    }
    await profileClick(ctx, '/grammar', '阅读', `${tag}：语法页点“阅读”`)
    if (seeded) {
      await profileClick(ctx, '/grammar', '错词本', `${tag}：语法页点“错词本”`)
      await profileClick(ctx, '/grammar', '首页', `${tag}：语法页点“首页”`)
    }
    await ctx.close()
  }
  await browser.close()
  process.exit(0)
}
for (const seeded of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const setup = await ctx.newPage()
  await setup.goto(`${BASE}404.svg`)
  const keys = seeded ? await setup.evaluate(seed) : 0
  await setup.close()
  console.log(`\n===== ${seeded ? `长期使用数据（${keys} 个存储键）` : '空存储'} =====`)
  // CPU 热点（只在长期数据下抓）
  let cdp
  let profPage
  if (seeded) {
    profPage = await ctx.newPage()
    cdp = await ctx.newCDPSession(profPage)
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
    for (const route of ROUTES) {
      await profPage.goto(`${BASE}#${route}`)
      await profPage.waitForLoadState('networkidle').catch(() => {})
      const buttons = profPage.locator('main button')
      const n = Math.min(await buttons.count(), 6)
      for (let i = 0; i < n; i++) {
        const text = (await buttons.nth(i).textContent().catch(() => '')) ?? ''
        if (UNSAFE.test(text))
          continue
        await buttons.nth(i).click({ timeout: 1000, noWaitAfter: true }).catch(() => {})
        await profPage.waitForTimeout(150)
      }
    }
    const { profile } = await cdp.send('Profiler.stop')
    const self = new Map()
    const byId = new Map(profile.nodes.map(n => [n.id, n]))
    const dt = profile.timeDeltas
    profile.samples.forEach((id, i) => {
      const n = byId.get(id)
      const f = n.callFrame
      const name = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`
      self.set(name, (self.get(name) ?? 0) + (dt[i] ?? 0) / 1000)
    })
    const total = [...self.values()].reduce((a, b) => a + b, 0)
    console.log(`CPU 热点（自身耗时，总采样 ${Math.round(total)}ms）：`)
    for (const [name, ms] of [...self.entries()].filter(([n]) => !/^\((idle|program|garbage collector)\)/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, 25))
      console.log(`  ${ms.toFixed(0).padStart(6)}ms  ${name}`)
    const gc = self.get('(garbage collector) :0') ?? 0
    console.log(`  GC ${gc.toFixed(0)}ms`)
    await profPage.close()
  }
  for (const route of ROUTES) {
    const r = await measureRoute(ctx, route, seeded)
    report.push(r)
    const slow = r.clicks.filter(c => c.ev >= 100 || c.lt >= 100).sort((a, b) => b.ev - a.ev)
    const maxEv = Math.max(0, ...r.clicks.map(c => c.ev))
    console.log(`${route.padEnd(24)} 打开 ${String(r.loadMs).padStart(5)}ms  点击 ${r.clicks.length} 个，最慢 ${Math.round(maxEv)}ms${slow.length ? `  慢：${slow.slice(0, 4).map(c => `${c.label}=${Math.round(c.ev)}ms/长任务${Math.round(c.lt)}ms`).join('；')}` : ''}${r.errors.length ? `  报错：${r.errors.slice(0, 2).join(' | ')}` : ''}`)
  }
  await ctx.close()
}
await browser.close()
