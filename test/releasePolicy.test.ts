import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('deployment verification retries ten times, sleeps only between tries and fails independently of source push', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8')
  const step = workflow.slice(workflow.indexOf('- name: Verify deployed site'))
  expect(step).not.toContain('continue-on-error')
  const body = step
    .slice(step.indexOf('for attempt'))
    .split('\n')
    .map(line => line.trimStart())
    .join('\n')
  const result = spawnSync(
    'bash',
    [
      '-c',
      `node(){ echo NODE_CALL; return 1; }; sleep(){ echo SLEEP_CALL; }; ${
        body}`,
    ],
    { encoding: 'utf8' },
  )
  expect(result.status).toBe(1)
  expect(result.stdout.match(/NODE_CALL/g)).toHaveLength(10)
  expect(result.stdout.match(/SLEEP_CALL/g)).toHaveLength(9)
  expect(result.stdout).toContain('源码推送已完成')
})
