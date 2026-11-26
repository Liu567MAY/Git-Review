import type { Agent, Row } from './events'

type Location = { path: string; startLine: number; endLine: number }
type Claim = { id: string; claim: string; verdict: string; source: Location; evidence: Location[]; reason: string }
type Suggestion = {
  findingId: string; priority: string; location?: Location | string; reason: string; proposal?: string; verification: string
  diff?: { path: string; startLine: number; lines: { kind: 'add' | 'remove'; line: number; content: string }[] }
}
type Payload =
  | { type: 'agent.started' | 'handoff' }
  | { type: 'tool.called' | 'tool.completed'; name: string; summary?: string; evidenceCount?: number; ok?: boolean }
  | { type: 'finding.confirmed'; id: string; verdict: string }
  | { type: 'agent.completed'; agent: 0; result: Claim[] }
  | { type: 'agent.completed'; agent: 1; result: Suggestion[] }
  | { type: 'review.completed'; audit: Claim[]; suggestions: Suggestion[] }
  | { type: 'review.failed'; code: string; partial: boolean; audit?: Claim[] }

export type ReviewEvent = Payload & { runId: string; seq: number; agent: Agent }

const errors: Record<string, string> = {
  SNAPSHOT_EXPIRED: '扫描快照已过期，请重新扫描。',
  AI_NOT_CONFIGURED: '后端尚未配置 AI 模型。',
  AI_BUSY: 'AI 审查繁忙，请稍后重试。',
  AI_TIMEOUT: 'AI 审查超时，请重试。',
}
export function reviewError(code: string, message?: string) {
  return errors[code] ?? message ?? ('AI 审查失败（' + code + '）')
}
function formatLocation(location?: Location | string) {
  if (!location) return '位置待核实'
  if (typeof location === 'string') return location
  return location.path + ':' + location.startLine + (location.endLine === location.startLine ? '' : '–' + location.endLine)
}
export const auditRows = (claims: Claim[]): Row[] => claims.map(claim => ({
  status: claim.verdict, tone: claim.verdict === '一致' ? 'good' : claim.verdict === '不一致' ? 'bad' : 'unknown',
  claim: claim.claim, file: formatLocation(claim.source),
  evidence: claim.evidence.map(formatLocation).join('\n') || '暂无对照证据',
  note: claim.reason,
}))
export const adviceRows = (suggestions: Suggestion[]): Row[] => suggestions.map(item => ({
  status: item.priority, tone: item.priority === 'P0' ? 'bad' : item.priority === 'P1' ? 'unknown' : 'good',
  claim: item.proposal || '核实 ' + item.findingId, file: formatLocation(item.location),
  why: item.reason, verification: item.verification,
  diff: item.diff,
}))

export async function streamReview(snapshotId: string, signal: AbortSignal, receive: (event: ReviewEvent) => void) {
  const response = await fetch('/api/ai/reviews', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ snapshotId }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(reviewError(body?.error?.code ?? String(response.status), body?.error?.message))
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error('AI 审查未返回事件流。')
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let runId: string | undefined
  let sequence = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error('AI 审查连接中断，未收到最终结果。')
      buffer += chunk.value
      let boundary: RegExpExecArray | null
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary[0].length)
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n')
        if (!data) continue
        const event = JSON.parse(data) as ReviewEvent
        if (typeof event.runId !== 'string' || !Number.isSafeInteger(event.seq) || event.seq <= sequence || (runId && runId !== event.runId)) continue
        runId = event.runId
        sequence = event.seq
        receive(event)
        if (event.type === 'review.completed' || event.type === 'review.failed') return
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}