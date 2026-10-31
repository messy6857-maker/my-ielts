import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import process from 'node:process'
import { expect, it } from 'vitest'

const smoke = resolve('scripts/smoke-site.mjs')
async function fixture(index: string, asset: boolean, htmlFallback = false) {
  const directory = await mkdtemp(join(tmpdir(), 'ielts-smoke-'))
  await mkdir(join(directory, 'dist/assets'), { recursive: true })
  await writeFile(join(directory, 'dist/index.html'), index)
  if (asset) {
    await writeFile(
      join(directory, 'dist/assets/entry.js'),
      'export default 1',
    )
  }
  const server = createServer((_req, response) => {
    response.setHeader(
      'Content-Type',
      htmlFallback ? 'text/html' : 'text/javascript',
    )
    response.end(index)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address() as { port: number }
    return await new Promise<number | null>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [smoke, `http://127.0.0.1:${address.port}`],
        { cwd: directory, stdio: 'ignore' },
      )
      child.on('error', reject)
      child.on('exit', resolve)
    })
  }
  finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
}
it('smoke fails when the build has no bundle', async () => {
  expect(await fixture('<html>empty build</html>', false)).not.toBe(0)
})
it('smoke fails when a referenced build chunk is missing locally', async () => {
  expect(
    await fixture('<script src="assets/entry.js"></script>', false),
  ).not.toBe(0)
})
it('smoke rejects an HTTP 200 HTML fallback for a JavaScript chunk', async () => {
  expect(
    await fixture('<script src="assets/entry.js"></script>', true, true),
  ).not.toBe(0)
})
