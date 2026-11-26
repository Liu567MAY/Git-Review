import { randomUUID } from 'node:crypto'
import { ApiError, githubGet } from './github.ts'
import { fields, publicRepository } from './repositories.ts'
import { binaryExtension, maxBytes, shaPattern, utf8 } from './scan.ts'
import { redact } from './scan-rules.ts'
import type { Snapshot } from './snapshots.ts'

export function safeText(text: string) {
  const key = process.env.AI_API_KEY?.trim()
  const withoutKey = key ? text.replaceAll(key, '[已脱敏]') : text
  return redact(withoutKey
    .replace(/-----BEGIN [^\r\n]*PRIVATE KEY-----[\s\S]*?(?:-----END [^\r\n]*PRIVATE KEY-----|$)/g,
      block => block.replace(/[^\r\n]+/g, '[已脱敏]'))
    .replace(/^.*(?:\b(?:gh[pousr]_[a-z0-9]+|github_pat_[a-z0-9_]+|sk-[a-z0-9_-]{12,}|AKID[A-Z0-9]{8,}|AKIA[A-Z0-9]{16}|Bearer[ \t]+\S+)|(?:token|secret|password|passwd|api[_-]?key|private[_-]?key|authorization)[\w"']*\s*[:=]|[a-z][a-z0-9+.-]*:\/\/[^/\s]+:[^@\s]+@).*$/gim, '[已脱敏]'))
}

function blocked(path: string) {
  return /(?:^|\/)(?:\.env(?:[./]|$)|id_(?:rsa|dsa|ecdsa|ed25519)(?:$|\/)|\.netrc$|\.npmrc$)|\.(?:pem|key|p12|pfx|ppk|jks)$/i.test(path)
    || safeText(path) !== path
}

const string = { type: 'string' }
const integer = { type: 'integer' }
const maxReadLines = 160
export const toolDefinitions = [
  ['list_files', '列出已知文件路径，最多 32 条。可按 prefix 筛选。', { prefix: string }, []],
  ['read_file', '传入 path 直接读取已知文本。可选 1-based 起止行，每次最多返回 160 行。若返回 nextStartLine，可从该行继续读取。', { path: string, startLine: integer, endLine: integer }, ['path']],
  ['search_code', '在已缓存的脱敏文本中进行字面关键字搜索。', { query: string, prefix: string }, ['query']],
].map(([name, description, properties, required]) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
}))

export class ReviewError extends Error {
  readonly detail?: string

  constructor(code: string, detail?: string) {
    super(code)
    this.detail = detail
  }
}

export function toolArguments(name: string, raw: string) {
  const schema = toolDefinitions.find(tool => tool.function.name === name)?.function.parameters
  if (!schema || raw.length > 1800) throw new ReviewError('AI_INVALID_TOOL')
  const input: unknown = JSON.parse(raw)
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ReviewError('AI_INVALID_TOOL')
  const args = input as Record<string, unknown>
  const keys = Object.keys(schema.properties)
  if (Object.keys(args).some(key => !keys.includes(key))) throw new ReviewError('AI_INVALID_TOOL')
  const textOk = (value: unknown, max: number) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f]/.test(value)
  const prefix = args.prefix ?? ''
  if (!textOk(prefix, 360)) throw new ReviewError('AI_INVALID_TOOL')
  if (name === 'search_code' && (!textOk(args.query, 120) || !String(args.query).trim())) throw new ReviewError('AI_INVALID_TOOL')
  if (name === 'read_file') {
    const start = args.startLine ?? 1, end = args.endLine ?? Number.MAX_SAFE_INTEGER
    if (!textOk(args.path, 500) || !args.path || typeof start !== 'number' || typeof end !== 'number'
      || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
      throw new ReviewError('AI_INVALID_TOOL')
    }
    args.startLine = start
    args.endLine = end
  }
  return args as { prefix?: string; query?: string; path?: string; startLine?: number; endLine?: number }
}

export type Evidence = { id: string; path: string; startLine: number; endLine: number; text: string; clipped: boolean }

export function createReviewTools(snapshot: Snapshot, signal: AbortSignal) {
  const files = new Map(snapshot.files.map(file => [file.path, file]))
  const cache = new Map<string, string>()
  const attempted = new Set<string>()
  const evidence = new Map<string, Evidence>()
  const [owner, repo] = snapshot.repository.split('/')
  for (const [path, text] of snapshot.texts) {
    if (!blocked(path) && !/-----BEGIN [^\r\n]*PRIVATE KEY-----/.test(text)) cache.set(path, safeText(text))
  }
  function record(path: string, source: string[], start: number, end: number) {
    const lines = source.slice(start - 1, end)
    const clipped = lines.some(line => line.length > 180)
    const item = { id: randomUUID(), path, startLine: start, endLine: start + lines.length - 1,
      text: lines.map(line => line.slice(0, 180)).join('\n'), clipped }
    evidence.set(item.id, item)
    return item
  }
  async function execute(name: string, args: ReturnType<typeof toolArguments>) {
    signal.throwIfAborted()
    const prefix = args.prefix ?? ''
    if (name === 'list_files') {
      const matching = snapshot.files.filter(file => file.path.startsWith(prefix) && !blocked(file.path))
      return { paths: matching.slice(0, 32).map(file => file.path.slice(0, 180)), treeTruncated: snapshot.treeTruncated,
        truncated: matching.length > 32 || matching.slice(0,32).some(file => file.path.length > 180), pagination: false }
    }
    if (name === 'search_code') {
      const query = args.query!.toLowerCase()
      const matches: Evidence[] = []
      let truncated = false
      let searchedFiles = 0
      for (const [path, text] of cache) {
        if (!path.startsWith(prefix)) continue
        searchedFiles++
        const lines = text.split(/\r\n|\n|\r/)
        for (const [index, line] of lines.entries()) {
          if (!line.toLowerCase().includes(query)) continue
          if (matches.length < 8) matches.push(record(path, lines, index + 1, index + 1))
          else truncated = true
        }
      }
      return { matches, truncated, searchedFiles, treeTruncated: snapshot.treeTruncated,
        coversEntireRepository: !prefix && !snapshot.treeTruncated && cache.size === snapshot.files.length }
    }
    const { path, startLine, endLine } = args
    const file = files.get(path!)
    if (!file?.regular || blocked(file.path) || binaryExtension.test(file.path) || typeof file.size !== 'number'
      || file.size < 0 || file.size > maxBytes || typeof file.sha !== 'string' || !shaPattern.test(file.sha)) {
      return { error: 'FILE_NOT_ELIGIBLE' }
    }
    const cached = cache.has(file.path)
    if (!cached) {
      if (snapshot.texts.has(file.path)) return { error: 'FILE_NOT_ELIGIBLE' }
      if (attempted.has(file.path)) return { error: 'FILE_UNAVAILABLE' }
      if (attempted.size >= 4) return { error: 'READ_BUDGET_EXHAUSTED' }
      attempted.add(file.path)
      let blob
      try {
        const current = await publicRepository(owner, repo, signal)
        if (current.name.toLowerCase() !== snapshot.repository.toLowerCase()) throw new ApiError('REPOSITORY_UNAVAILABLE')
        blob = fields((await githubGet('/repos/' + snapshot.repository + '/git/blobs/' + file.sha, undefined, signal)).data)
      } catch (error) {
        if (!signal.aborted && error instanceof ApiError
          && ['GITHUB_TIMEOUT', 'GITHUB_NETWORK_ERROR', 'GITHUB_UPSTREAM_ERROR'].includes(error.code)) {
          return { error: error.code }
        }
        throw error
      }
      if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.content.length > maxBytes * 1.5) {
        return { error: 'FILE_UNAVAILABLE' }
      }
      const bytes = Buffer.from(blob.content, 'base64')
      if (bytes.length !== file.size || bytes.includes(0)) return { error: 'FILE_UNAVAILABLE' }
      let text: string
      try { text = utf8.decode(bytes) } catch { return { error: 'FILE_UNAVAILABLE' } }
      if (/-----BEGIN [^\r\n]*PRIVATE KEY-----/.test(text)) return { error: 'FILE_NOT_ELIGIBLE' }
      cache.set(file.path, safeText(text))
    }
    const lines = cache.get(file.path)!.split(/\r\n|\n|\r/)
    if (startLine! > lines.length) return { error: 'OUT_OF_RANGE', totalLines: lines.length }
    const lastLine = Math.min(endLine!, startLine! + maxReadLines - 1, lines.length)
    return { evidence: record(file.path, lines, startLine!, lastLine), cached, totalLines: lines.length,
      nextStartLine: lastLine < Math.min(endLine!, lines.length) ? lastLine + 1 : undefined }
  }
  return { execute, evidence }
}
