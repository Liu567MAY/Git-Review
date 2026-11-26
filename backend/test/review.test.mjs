import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import express from 'express'
import { createReviewRouter } from '../dist/review-routes.js'
import { reviewSnapshot } from '../dist/review.js'
import { getSnapshot, saveSnapshot } from '../dist/snapshots.js'
import { createReviewTools, ReviewError, toolArguments } from '../dist/review-tools.js'

const sha = 'a'.repeat(40)
const blob = 'b'.repeat(40)
const manifest = '{"engines":{"node":">=22"}}'
const token = 'sk-' + 'f'.repeat(24)
const snapshot = {
  repository: 'sample/project', branch: 'feature/demo', commit: sha, treeTruncated: false,
  tree: [],
  files: [
    { path: 'README.md', sha, size: 8, regular: true },
    { path: 'package.json', sha: blob, size: manifest.length, regular: true },
    { path: '.env', sha, size: token.length, regular: true },
  ],
  texts: new Map([['README.md', 'Node 20\nAPI_KEY = ' + token], ['.env', token]]),
  report: { score: 80, risks: [], limits: [], partial: true },
}
const call = (name, args) => ({ tool_calls: [{ id: 'call_1', type: 'function',
  function: { name, arguments: JSON.stringify(args) } }] })
const read = path => call('read_file', { path, startLine: 1, endLine: 2 })
const output = value => ({ content: JSON.stringify(value) })
const latest = messages => JSON.parse(messages.at(-1).content)

test('模型只传路径即可读取文件，长文件按 160 行分页', async () => {
  const texts = new Map(snapshot.texts).set('README.md', Array.from({ length: 180 }, (_, i) => 'Line ' + (i + 1)).join('\n'))
  const tools = createReviewTools({ ...snapshot, texts }, new AbortController().signal)
  const args = toolArguments('read_file', JSON.stringify({path:'README.md'}))
  const result = await tools.execute('read_file', args)
  assert.equal(result.evidence.startLine, 1)
  assert.equal(result.evidence.endLine, 160)
  assert.equal(result.nextStartLine, 161)
  const tail = await tools.execute('read_file', toolArguments('read_file', '{"path":"README.md","startLine":161}'))
  assert.equal(tail.evidence.endLine, 180)
  assert.equal(tail.nextStartLine, undefined)
})

function github(t, { limit = false } = {}) {
  const fetch = globalThis.fetch
  const requests = []
  t.mock.method(globalThis, 'fetch', async (...args) => {
    const url = String(args[0])
    if (!url.startsWith('https://api.github.com')) return fetch(...args)
    requests.push(url)
    if (limit) return Response.json({ secret: token }, { status: 429 })
    if (url.endsWith('/git/blobs/' + blob)) return Response.json({
      encoding: 'base64', content: Buffer.from(manifest).toString('base64'),
    })
    assert.equal(url, 'https://api.github.com/repos/sample/project')
    return Response.json({ private: false, visibility: 'public', full_name: 'sample/project', default_branch: 'main' })
  })
  return requests
}

for (const verdict of ['一致', '不一致', '证据不足', '伪造', '无效对照']) {
  test('双 Agent ' + verdict, async t => {
    const requests = github(t)
    const events = []
    let sourceId, evidenceId
    const state = verdict === '一致' ? { ...snapshot, texts: new Map(snapshot.texts).set('README.md', 'Node 22\nAPI_KEY = ' + token) } : snapshot
    const model = async messages => {
      const isAudit = !messages[1].content.includes('"findings"')
      assert.ok(messages[1].content.includes(sha))
      assert.ok(!JSON.stringify(messages).includes(token))
      if (messages.length === 2) return read(isAudit ? 'README.md' : 'package.json')
      if (isAudit && messages.length === 4) {
        sourceId = latest(messages).evidence.id
        assert.match(latest(messages).evidence.text, /\[已脱敏\]/)
        return read('package.json')
      }
      if (isAudit) return output({ claims: [{
        claim: '模型改写后的文字', sourceId: verdict === '伪造' ? 'forged' : sourceId, sourceLine: 1,
        verdict: ['伪造', '无效对照'].includes(verdict) ? '一致' : verdict,
        evidenceIds: verdict === '无效对照' ? ['forged'] : verdict === '证据不足' ? [] : [latest(messages).evidence.id],
        reason: '核对 Node 版本。',
      }] })
      assert.equal(latest(messages).cached, true)
      evidenceId = latest(messages).evidence.id
      return output({ suggestions: verdict === '一致' ? [] : [{ findingId: 'claim-1', priority: 'P1',
        evidenceId, before: manifest, after: '{"engines":{"node":">=20"}}', reason: '版本描述不同',
        proposal: '核实目标后调整版本声明', verification: '用目标版本验证启动' }] })
    }
    await reviewSnapshot(state, model, event => events.push(event), new AbortController().signal)
    assert.equal(requests.filter(url => url.includes('/blobs/')).length, 1)
    assert.equal(state.texts.has('package.json'), false)
    assert.ok(!JSON.stringify(events).includes(token))
    const end = events.at(-1)
    if (verdict === '伪造') {
      assert.equal(end.code, 'AI_INVALID_EVIDENCE')
      assert.equal(events.some(event => event.type === 'handoff'), false)
    } else {
      assert.equal(end.type, 'review.completed')
      assert.equal(end.score, 80)
      assert.equal(end.commit, sha)
      assert.deepEqual(events.filter(event => ['agent.started','agent.completed','handoff'].includes(event.type))
        .map(event => [event.type, event.agent]), [['agent.started',0],['agent.completed',0],['handoff',0],['agent.started',1],['agent.completed',1]])
      if (verdict === '不一致') {
        assert.equal(end.suggestions[0].diff.lines[0].line, 1)
        assert.equal(end.suggestions[0].diff.lines[0].content, manifest)
      }
      if (verdict === '证据不足') assert.equal(end.suggestions[0].diff, undefined)
      if (verdict === '无效对照') {
        assert.equal(end.audit[0].claim, 'Node 20')
        assert.equal(end.audit[0].verdict, '证据不足')
        assert.deepEqual(end.audit[0].evidence, [])
        assert.equal(end.suggestions[0].diff, undefined)
      }
      if (verdict === '一致') assert.equal(end.suggestions.length, 0)
    }
  })
}

test('快照 TTL 和 GitHub 限流', async t => {
  const now = Date.now()
  t.mock.method(Date, 'now', () => now)
  const id = saveSnapshot(snapshot)
  assert.ok(getSnapshot(id))
  Date.now.mock.mockImplementation(() => now + 900000)
  assert.equal(getSnapshot(id), undefined)
  github(t, { limit: true })
  const events = []
  await reviewSnapshot(snapshot, () => assert.fail('model called'), event => events.push(event), new AbortController().signal)
  assert.equal(events.at(-1).code, 'GITHUB_RATE_LIMITED')
})

test('Agent 2 模型超时时保留 Agent 1 已校验结果', async t => {
  github(t)
  const events = []
  await reviewSnapshot(snapshot, async messages => {
    if (messages[1].content.includes('"findings"')) throw new ReviewError('AI_TIMEOUT')
    return output({ claims: [] })
  }, event => events.push(event), new AbortController().signal)
  assert.deepEqual(events.at(-1), { type: 'review.failed', agent: 1, code: 'AI_TIMEOUT', partial: true, audit: [] })
  assert.equal(events.filter(event => event.type.startsWith('review.')).length, 1)
})

test('SSE 断开取消模型调用，随后可以发起下一次审查', async t => {
  github(t)
  const app = express()
  let connected
  let stopped
  const entered = new Promise(resolve => { connected = resolve })
  const aborted = new Promise(resolve => { stopped = resolve })
  let first = true
  app.use('/api/ai', createReviewRouter(() => async (_messages, signal) => {
    if (!first) return output(_messages[1].content.includes('"findings"') ? { suggestions: [] } : { claims: [] })
    first = false
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => { stopped(); reject(signal.reason) }, { once: true })
      connected()
    })
  }))
  const server = app.listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    const endpoint = 'http://127.0.0.1:' + server.address().port + '/api/ai/reviews'
    const id = saveSnapshot(snapshot)
    const controller = new AbortController()
    const post = signal => fetch(endpoint, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotId: id }) })
    const response = await post(controller.signal)
    assert.match(response.headers.get('content-type'), /text\/event-stream/)
    await entered
    controller.abort()
    await aborted
    const result = await (await post()).text()
    const events = result.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)))
    assert.deepEqual(events.map(event => event.seq), [1, 2, 3, 4, 5, 6])
    assert.equal(new Set(events.map(event => event.runId)).size, 1)
    assert.deepEqual(events.filter(event => event.type.startsWith('review.')).map(event => event.type), ['review.completed'])
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
