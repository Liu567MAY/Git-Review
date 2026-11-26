import { ApiError, githubGet } from './github.ts'
import { fields, resolveBranch } from './repositories.ts'
import { analyze, priority, redact } from './scan-rules.ts'
import { saveSnapshot } from './snapshots.ts'

const maxFiles = 24
export const maxBytes = 64 * 1024
export const shaPattern = /^[a-f0-9]{40}$/i
export const binaryExtension = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|jar|class|exe|dll|mp[34])$/i
export const utf8 = new TextDecoder('utf-8', { fatal: true })

export async function scanRepository(owner: string, repo: string, branch: string) {
  const { repository, commit } = await resolveBranch(owner, repo, branch)
  const root = `/repos/${repository}/git`
  const deadline = AbortSignal.timeout(25000)
  const get = async (path: string) => fields((await githubGet(root + path, undefined, deadline)).data)
  const tree = await (async () => {
    try {
      const revision = await get('/commits/' + commit)
      const sha = fields(revision.tree).sha
      if (typeof sha !== 'string' || !shaPattern.test(sha)) throw new ApiError('TREE_UNAVAILABLE')
      const result = await get('/trees/' + sha + '?recursive=1')
      if (!Array.isArray(result.tree) || typeof result.truncated !== 'boolean') throw new ApiError('TREE_UNAVAILABLE')
      return { entries: result.tree.map(fields), truncated: result.truncated }
    } catch (error) {
      if (error instanceof ApiError && ['GITHUB_RATE_LIMITED', 'GITHUB_TIMEOUT', 'GITHUB_NETWORK_ERROR'].includes(error.code)) throw error
      throw new ApiError('TREE_UNAVAILABLE')
    }
  })()

  const files = tree.entries.filter(item => item.type === 'blob' || item.type === 'commit').map(item => {
    if (typeof item.path !== 'string') throw new ApiError('TREE_UNAVAILABLE')
    return { path: item.path, sha: item.sha, size: item.size, regular: item.type === 'blob' && item.mode !== '120000' }
  }).sort((a, b) => priority(a.path) - priority(b.path) || (a.path < b.path ? -1 : Number(a.path > b.path)))
  const texts = new Map<string, string>()
  let binary = 0, special = 0, oversized = 0, overCount = 0, overTime = 0, failed = 0, limited = 0
  const candidates = files.filter(file => {
    if (!file.regular) { special++; return false }
    if (binaryExtension.test(file.path)) { binary++; return false }
    if (typeof file.size === 'number' && file.size > maxBytes) { oversized++; return false }
    return true
  })
  overCount = Math.max(0, candidates.length - maxFiles)
  const selected = candidates.slice(0, maxFiles)
  for (let start = 0; start < selected.length; start += 4) {
    if (deadline.aborted || limited) {
      overTime = selected.length - start
      break
    }
    const results = await Promise.all(selected.slice(start, start + 4).map(async file => {
      try {
        if (typeof file.sha !== 'string' || !shaPattern.test(file.sha)) throw new ApiError('GITHUB_UPSTREAM_ERROR')
        const blob = await get('/blobs/' + file.sha)
        if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new ApiError('GITHUB_UPSTREAM_ERROR')
        if (blob.content.length > maxBytes * 1.5) { oversized++; return }
        const bytes = Buffer.from(blob.content, 'base64')
        if (bytes.length > maxBytes) { oversized++; return }
        if (typeof file.size === 'number' && bytes.length !== file.size) throw new ApiError('GITHUB_UPSTREAM_ERROR')
        try {
          if (bytes.includes(0)) { binary++; return }
          return { path: file.path, text: utf8.decode(bytes) }
        } catch { binary++ }
      } catch (error) {
        failed++
        if (error instanceof ApiError && error.code === 'GITHUB_RATE_LIMITED') limited++
      }
    }))
    for (const result of results) if (result) texts.set(result.path, result.text)
  }

  const limits = [
    tree.truncated && 'GitHub 文件树截断，计数仅基于已返回条目',
    binary && `跳过 ${binary} 个二进制或非 UTF-8 文件`,
    special && `跳过 ${special} 个符号链接或子模块`,
    oversized && `${oversized} 个文件超过 64 KiB`,
    overCount && `${overCount} 个文件超过 24 个候选文件上限`,
    failed && `${failed} 个文件读取失败`,
    limited && '内容请求遇到 GitHub 限流',
    overTime && `${overTime} 个文件因扫描时限或限流未请求`,
    deadline.aborted && '扫描达到读取时限',
  ].filter((reason): reason is string => typeof reason === 'string')
  const partial = Boolean(tree.truncated || binary || special || oversized || overCount || failed || overTime)
  const report = {
    repository: redact(repository), branch: redact(branch), commit, scannedAt: new Date().toISOString(),
    read: texts.size, skipped: binary + special + oversized + overCount + overTime, failed, partial,
    limits: limits.length ? limits : ['已读取文件树中的全部文本候选文件'],
    ...analyze(files.map(file => file.path), texts, tree.truncated, partial),
  }
  return { ...report, snapshotId: saveSnapshot({
    repository, branch, commit, files, texts, tree: tree.entries, treeTruncated: tree.truncated, report,
  }) }
}
