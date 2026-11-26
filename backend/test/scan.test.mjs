import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scanRepository } from '../dist/scan.js'
import { analyze } from '../dist/scan-rules.js'
import { getSnapshot } from '../dist/snapshots.js'

test('只读取固定版本，报告覆盖限制并隐藏凭据原文', async t => {
  const commit = 'a'.repeat(40)
  const tree = 'b'.repeat(40)
  const fakeSecret = 'sk-' + 'x'.repeat(24)
  const sources = new Map()
  const entries = []
  function file(path, content, { size = Buffer.byteLength(content), fail = false } = {}) {
    const sha = entries.length.toString(16).padStart(40, '0')
    entries.push({ path, sha, size, type: 'blob', mode: '100644' })
    sources.set(sha, fail ? null : Buffer.from(content).toString('base64'))
  }
  file('README.md', 'npm ci\nnpm run dev\nRun setup.ps1')
  file('package.json', '{"scripts":{"dev":"node index.js"}}')
  file('setup.ps1', 'echo ok')
  file('index.js', 'const config = "C:\\\\work\\\\config";\nconst key = "' + fakeSecret + '";')
  file('.env', 'VALUE=fixture')
  file('bad.txt', 'unavailable', { fail: true })
  file('big.txt', '', { size: 65537 })
  file('asset.png', '')
  for (let i = 0; i < 25; i++) file('misc/' + i + '.txt', 'sample')

  const base = 'https://api.github.com/repos/sample/project'
  const requests = []
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url)
    if (url === base) return Response.json({ private: false, full_name: 'sample/project', default_branch: 'main' })
    if (url === base + '/branches/feature%2Fdemo') return Response.json({ commit: { sha: commit } })
    if (url === base + '/git/commits/' + commit) return Response.json({ tree: { sha: tree } })
    if (url === base + '/git/trees/' + tree + '?recursive=1') return Response.json({ tree: entries, truncated: true })
    const content = sources.get(url.replace(base + '/git/blobs/', ''))
    if (content === undefined) assert.fail('Unexpected GitHub request ' + url)
    return content === null ? Response.json({}, { status: 500 }) : Response.json({ encoding: 'base64', content })
  })

  const report = await scanRepository('sample', 'project', 'feature/demo')
  assert.deepEqual(requests.slice(0, 4), [base, base + '/branches/feature%2Fdemo',
    base + '/git/commits/' + commit, base + '/git/trees/' + tree + '?recursive=1'])
  assert.equal(requests.length, 28)
  assert.equal(report.branch, 'feature/demo')
  assert.equal(report.commit, commit)
  assert.equal(getSnapshot(report.snapshotId)?.commit, commit)
  assert.equal(report.partial, true)
  assert.deepEqual([report.read, report.skipped, report.failed], [23, 9, 1])
  assert.equal(report.score, 55)
  assert.deepEqual(report.risks.map(risk => risk.deduction), [10, 5, 15, 15])
  const repeated = await scanRepository('sample', 'project', 'feature/demo')
  assert.equal(repeated.commit, report.commit)
  assert.equal(repeated.score, report.score)
  assert.deepEqual(repeated.risks, report.risks)
  assert.deepEqual(repeated.limits, report.limits)
  assert.deepEqual(report.risks.map(risk => [risk.rule, risk.location]), [
    ['SEC_ENV', '.env'], ['SEC_SK', 'index.js:2'], ['WIN_SCRIPT', 'setup.ps1'], ['ABS_PATH', 'index.js:1'],
  ])
  assert.ok(report.risks.find(risk => risk.rule === 'WIN_SCRIPT').evidence.includes('README.md'))
  assert.equal(report.checks.integrity.every(item => item.status === '通过'), true)
  assert.ok(report.limits.some(reason => reason.includes('截断')))
  assert.ok(report.limits.some(reason => reason.includes('64 KiB')))
  assert.ok(report.limits.some(reason => reason.includes('24 个')))
  assert.doesNotMatch(JSON.stringify(report), new RegExp(fakeSecret))
})

test('识别 Python 和 Java 的依赖清单与启动声明，保留未知状态', () => {
  for (const [path, content, language] of [
    ['pyproject.toml', '[project.scripts]\napp = "sample:main"', 'Python'],
    ['pom.xml', '<mainClass>sample.Main</mainClass>', 'Java'],
  ]) {
    const result = analyze([path], new Map([[path, content]]), false, false)
    assert.match(result.checks.integrity[1].evidence, new RegExp(language))
    assert.equal(result.checks.integrity[2].status, '通过')
    assert.equal(result.score, 80)
  }
  const result = analyze(['code.txt'], new Map(), true, true)
  assert.equal(result.checks.integrity.every(item => item.status === '无法判断'), true)
  assert.equal(result.checks.security[0].status, '无法判断')
})

test('文件树请求失败时拒绝生成报告', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/repos/sample/project')) return Response.json({
      private: false, full_name: 'sample/project', default_branch: 'main',
    })
    if (url.endsWith('/branches/main')) return Response.json({ commit: { sha: 'a'.repeat(40) } })
    if (url.includes('/git/commits/')) return Response.json({ tree: { sha: 'b'.repeat(40) } })
    return Response.json({}, { status: 500 })
  })
  await assert.rejects(scanRepository('sample', 'project', 'main'), { code: 'TREE_UNAVAILABLE' })
})

test('疑似凭据仅输出类型和位置，同一规则只扣分一次', () => {
  const secrets = [
    'sk-' + 'z'.repeat(24),
    'AKID' + 'ABCDEF123456',
    'Bearer ' + 'secret.fixture.token',
    '-----BEGIN ' + 'RSA PRIVATE KEY-----',
  ]
  const source = [...secrets, secrets[0], '/home/user/work'].join('\n')
  const paths = ['settings.txt']
  const files = new Map([[paths[0], source]])
  const report = analyze(paths, files, false, false)
  assert.deepEqual(report, analyze(paths, files, false, false))
  const output = JSON.stringify(report)
  for (const secret of secrets) assert.ok(!output.includes(secret))
  assert.deepEqual(report.risks.filter(risk => risk.category === 'security').map(risk => risk.location),
    ['settings.txt:1', 'settings.txt:2', 'settings.txt:3', 'settings.txt:4'])
  assert.equal(report.risks.find(risk => risk.rule === 'ABS_PATH').location, 'settings.txt:6')
})
