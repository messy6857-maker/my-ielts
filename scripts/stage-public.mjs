import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export function includePublicFile(path, android = false) {
  return !/(?:^|\/)(?:audacity_tags\.txt|\.DS_Store)$/.test(path)
    && !/^(?:screenshot(?:\/|$)|salvation_lies_within_IELTS_)/.test(path)
    && !/^vocabulary\/audio\/[^/]+\.mp3$/i.test(path)
    && !(android && /\.(?:mp3|m4a|wav|ogg)$/i.test(path))
}

/** Build the contract from runtime datasets, including remotely streamed chapter
 * audio. Walk AST string literals so comments/examples cannot create fake paths. */
export async function requiredPublicFiles(root) {
  const required = new Set(['.nojekyll', 'favicon.png', '404.svg', 'grammar/雅思语法.svg',
    'grammar/雅思语法-dark.svg', 'grammar/雅思基础语法配套课程讲义.pdf'])
  const vocabulary = join(root, 'src/data/vocabulary')
  for (const name of (await readdir(vocabulary)).filter(name => /^\d{2}\.json$/.test(name))) {
    const chapter = JSON.parse(await readFile(join(vocabulary, name), 'utf8'))
    required.add(`vocabulary/audio/${chapter.audio}`)
    for (const word of chapter.words.flat()) {
      if (word.word[0].toLowerCase() !== 'chef') required.add(`vocabulary/audio/${chapter.label}/${word.word[0]}.mp3`)
    }
  }
  const listening = JSON.parse(await readFile(join(root, 'src/pages/listening/listening179.json'), 'utf8'))
  listening.forEach(word => required.add(`179_audios/${word.word}.mp3`))
  const ts = await import('typescript')
  for (const dir of ['mock', 'writing', 'grammar']) {
    const source = join(root, 'src/pages', dir)
    for (const name of (await readdir(source)).filter(name => /\.(?:ts|vue)$/.test(name))) {
      const text = await readFile(join(source, name), 'utf8')
      const scripts = name.endsWith('.vue') ? [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]) : [text]
      for (const script of scripts) {
        const file = ts.createSourceFile(name, script, ts.ScriptTarget.Latest, true)
        function visit(node) {
          if (ts.isStringLiteralLike(node)) {
            for (const match of node.text.matchAll(/(?:^|["'=])((?:mock|writing|grammar)\/[^"'<>\s]+?\.(?:png|svg|pdf|mp3))(?=$|["'<>\s])/g)) {
              if (!/[{}]/.test(match[1])) required.add(match[1])
            }
          }
          ts.forEachChild(node, visit)
        }
        visit(file)
      }
      // Vue template links (the PDF link and images) are not in script ASTs.
      if (name.endsWith('.vue')) {
        for (const match of text.matchAll(/(?:src|href)="((?:grammar|writing|mock)\/[^"{}]+?\.(?:png|svg|pdf|mp3))"/g)) required.add(match[1])
      }
    }
  }
  return [...required].sort()
}

export async function validatePublicAssets(source, required, inventoryPath = process.env.PUBLIC_ASSET_INDEX) {
  let inventory
  if (inventoryPath) {
    inventory = JSON.parse(await readFile(resolve(inventoryPath), 'utf8'))
    if (!/^[a-f\d]{40}$/i.test(inventory.treeSha ?? '') || !inventory.files || typeof inventory.files !== 'object')
      throw new Error('PUBLIC_ASSET_INDEX 必须提供已核对 Git tree 的文件路径、blob SHA 和大小')
  }
  const missing = []
  for (const path of required) {
    const file = join(source, path)
    const info = await stat(file).catch(() => null)
    const remote = inventory?.files[path]
    if (inventory && (!remote || !/^[a-f\d]{40}$/i.test(remote.sha) || !Number.isSafeInteger(remote.size) || remote.size < 0)) {
      missing.push(path)
      continue
    }
    if (info?.isFile()) {
      if (inventory) {
        const bytes = await readFile(file)
        const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
        if (remote.sha !== sha || remote.size !== bytes.length) throw new Error(`资源与 Git tree 不一致：${path}`)
      }
    }
    else if (!inventory) missing.push(path)
  }
  if (missing.length) throw new Error(`发布资源缺失（${missing.length} 项）：${missing.slice(0, 12).join('、')}；请使用完整仓库或已核对的 PUBLIC_ASSET_INDEX`)
}

export async function stagePublic(source, destination, android = false, validate = true, required) {
  if (validate) await validatePublicAssets(source, required ?? await requiredPublicFiles(dirname(source)))
  await mkdir(destination, { recursive: true })
  for (const name of await readdir(source)) {
    await cp(join(source, name), join(destination, name), {
      recursive: true,
      filter: path => includePublicFile(relative(source, path).replaceAll('\\', '/'), android),
    })
  }
}

/** Runs for every Vite build entry, including bare `vite build` and APK builds. */
export function publicAssetsPlugin() {
  let config
  return {
    name: 'my-ielts-public-assets',
    apply: 'build',
    configResolved(resolved) { config = resolved },
    async writeBundle() {
      await stagePublic(join(config.root, 'public'), resolve(config.root, config.build.outDir), config.mode === 'android')
    },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  await stagePublic(join(root, 'public'), join(root, 'dist'), process.argv.includes('--android'))
  console.log(`Staged public assets for ${process.argv.includes('--android') ? 'Android (online audio)' : 'web'}`)
}
