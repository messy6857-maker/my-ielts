import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export function includePublicFile(path, android = false) {
  return !/(?:^|\/)(?:audacity_tags\.txt|\.DS_Store)$/.test(path)
    && !/^(?:screenshot(?:\/|$)|salvation_lies_within_IELTS_)/.test(path)
    && !/^vocabulary\/audio\/[^/]+\.mp3$/i.test(path)
    && !(android && /\.(?:mp3|m4a|wav|ogg)$/i.test(path))
}

export async function stagePublic(source, destination, android = false, validate = true) {
  if (validate && process.env.MEDIA_FROM_GIT_TREE !== '1') {
    const required = ['favicon.png', 'writing/c18-t1-task1.png', 'grammar/雅思基础语法配套课程讲义.pdf',
      ...android ? [] : ['179_audios/reserve.mp3', 'mock/cam18-test1-listening-part1.mp3', 'vocabulary/audio/01_自然地理/continent.mp3']]
    for (const path of required) {
      if (!(await stat(join(source, path)).catch(() => null))?.isFile())
        throw new Error(`发布资源缺失：public/${path}；请使用完整仓库构建`)
    }
  }
  await mkdir(destination, { recursive: true })
  for (const name of await readdir(source)) {
    await cp(join(source, name), join(destination, name), {
      recursive: true,
      filter: path => includePublicFile(relative(source, path).replaceAll('\\', '/'), android),
    })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  await stagePublic(join(root, 'public'), join(root, 'dist'), process.argv.includes('--android'))
  console.log(`Staged public assets for ${process.argv.includes('--android') ? 'Android (online audio)' : 'web'}`)
}
