import { ReviewError, toolDefinitions } from './review-tools.ts'

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
export type Message = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }
export type ModelClient = (messages: readonly Message[], signal: AbortSignal, allowTools?: boolean) => Promise<unknown>

export function configuredModel(): ModelClient | undefined {
  const key = process.env.AI_API_KEY?.trim()
  if (!key) return
  const base = new URL(process.env.AI_BASE_URL || 'https://api.deepseek.com')
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new ReviewError('AI_CONFIG_INVALID')
  }
  const endpoint = base.href.replace(/\/+$/, '') + '/chat/completions'
  const model = process.env.AI_MODEL?.trim() || 'deepseek-flash'
  return async (messages, signal, allowTools = true) => {
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(15000)])
    try {
      const response = await fetch(endpoint, {
        method: 'POST', redirect: 'error', signal: timeout,
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, tools: toolDefinitions, tool_choice: allowTools ? 'auto' : 'none',
          thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, max_tokens: 2500 }),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new ReviewError(response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_UPSTREAM_ERROR')
      }
      const reader = response.body?.getReader()
      if (!reader) throw new ReviewError('AI_UPSTREAM_ERROR')
      const chunks: Uint8Array[] = []
      let bytes = 0
      try {
        while (true) {
          const result = await reader.read()
          if (result.done) break
          bytes += result.value.length
          if (bytes > 65536) throw new ReviewError('AI_INVALID_OUTPUT')
          chunks.push(result.value)
        }
      } finally { await reader.cancel().catch(() => {}) }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      return data?.choices?.[0]?.message
    } catch (error) {
      if (error instanceof ReviewError) throw error
      throw new ReviewError(timeout.aborted ? 'AI_TIMEOUT' : 'AI_UPSTREAM_ERROR')
    }
  }
}
