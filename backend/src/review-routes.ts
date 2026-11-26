import { randomUUID } from 'node:crypto'
import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { configuredModel } from './review-model.ts'
import type { ModelClient } from './review-model.ts'
import { reviewSnapshot } from './review.ts'
import { getSnapshot } from './snapshots.ts'

export function createReviewRouter(modelFactory: () => ModelClient | undefined = configuredModel) {
  const router = express.Router()
  let active = 0
  router.post('/reviews', express.json({ limit: '2kb' }), async (request, response) => {
    const snapshotId = request.body?.snapshotId
    if (typeof snapshotId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(snapshotId)
      || Object.keys(request.body).length !== 1) {
      response.status(400).json({ error: { code: 'INVALID_SNAPSHOT_ID', message: '请提供扫描返回的 snapshotId。' } })
      return
    }
    const snapshot = getSnapshot(snapshotId)
    if (!snapshot) {
      response.status(410).json({ error: { code: 'SNAPSHOT_EXPIRED', message: '扫描快照不存在或已过期，请重新扫描。' } })
      return
    }
    let model
    try { model = modelFactory() } catch {
      response.status(503).json({ error: { code: 'AI_CONFIG_INVALID', message: 'AI 模型配置无效。' } })
      return
    }
    if (!model || active >= 3) {
      response.status(503).json({ error: model
        ? { code: 'AI_BUSY', message: 'AI 审查繁忙，请稍后重试。' }
        : { code: 'AI_NOT_CONFIGURED', message: '后端尚未配置 AI 模型。' } })
      return
    }
    active++
    const disconnected = new AbortController()
    const deadline = new AbortController()
    const timer = setTimeout(() => deadline.abort(), 45000)
    const signal = AbortSignal.any([disconnected.signal, deadline.signal])
    const runId = randomUUID()
    let seq = 0
    let terminal = false
    const close = () => disconnected.abort()
    response.once('close', close)
    const heartbeat = setInterval(() => {
      if (!response.destroyed && !terminal) response.write(': heartbeat\n\n')
    }, 10000)
    try {
      response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' })
      response.flushHeaders()
      await reviewSnapshot(snapshot, model, event => {
        if (response.destroyed || terminal) return
        terminal = event.type === 'review.completed' || event.type === 'review.failed'
        response.write('event: ' + event.type + '\ndata: ' + JSON.stringify({ ...event, runId, seq: ++seq }) + '\n\n')
      }, signal)
    } finally {
      active--
      clearInterval(heartbeat)
      clearTimeout(timer)
      response.off('close', close)
      if (!response.destroyed) response.end()
    }
  })
  const parseError: ErrorRequestHandler = (_error, _request, response, _next) => {
    response.status(400).json({ error: { code: 'INVALID_REQUEST', message: '请求格式无效。' } })
  }
  router.use(parseError)
  return router
}
