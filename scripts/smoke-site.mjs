import { readFile, readdir } from 'node:fs/promises'
const site = process.argv[2]
if (!site) throw new Error('缺少站点地址')
const index = await readFile('dist/index.html', 'utf8')
const entries = [...index.matchAll(/(?:src|href)="(?:\.\/)?(assets\/[^" ]+\.(?:js|css))"/g)].map(x=>x[1])
if (!entries.some(x=>x.endsWith('.js'))) throw new Error('构建 index 缺少入口脚本')
const assets = (await readdir('dist/assets')).filter(x=>/\.(?:js|css)$/.test(x)).map(x=>`assets/${x}`)
for (const entry of entries) if (!assets.includes(entry)) throw new Error(`构建产物缺少 ${entry}`)
const response = await fetch(`${site}/`)
if (!response.ok) throw new Error(`首页 HTTP ${response.status}`)
const html = await response.text()
for (const entry of entries) if (!html.includes(entry)) throw new Error(`首页仍未引用 ${entry}`)
for (let i=0;i<assets.length;i+=6) await Promise.all(assets.slice(i,i+6).map(async asset=>{
 const r=await fetch(`${site}/${asset}`)
 if (!r.ok || /text\/html/.test(r.headers.get('content-type') || '')) throw new Error(`${asset}: HTTP ${r.status} 或返回 HTML`)
 if (!(await r.arrayBuffer()).byteLength) throw new Error(`${asset}: 空文件`)
}))
console.log(`已验证首页及 ${assets.length} 个脚本/样式产物`)
