const apiOrigin = 'https://api.github.com'

const errors = {
  REPOSITORY_URL_REQUIRED: [400, '请输入 GitHub 仓库链接'],
  INVALID_REPOSITORY_URL: [400, '请输入有效的 GitHub 仓库主页 HTTPS 链接'],
  INVALID_REPOSITORY: [400, '仓库名称无效'],
  INVALID_PAGE: [400, '页码必须是正整数'],
  INVALID_BRANCH: [400, '分支名称无效'],
  INVALID_REQUEST: [400, '请求格式无效'],
  REPOSITORY_NOT_PUBLIC: [403, '该仓库为非公开仓库，请输入公开的 GitHub 仓库链接'],
  REPOSITORY_UNAVAILABLE: [404, '无法访问该仓库，请检查链接并确认仓库已公开'],
  BRANCH_NOT_FOUND: [404, '找不到该分支，请刷新分支列表'],
  GITHUB_RATE_LIMITED: [429, 'GitHub API 请求受限，请稍后重试'],
  GITHUB_TIMEOUT: [504, 'GitHub API 请求超时，请重试'],
  GITHUB_NETWORK_ERROR: [502, '无法连接 GitHub API，请重试'],
  GITHUB_UPSTREAM_ERROR: [502, 'GitHub API 暂时不可用，请重试'],
  INTERNAL_ERROR: [500, '服务暂时不可用'],
} as const

export class ApiError extends Error {
  readonly code: keyof typeof errors
  readonly status: number

  constructor(code: keyof typeof errors) {
    const [status, message] = errors[code]
    super(message)
    this.code = code
    this.status = status
  }
}

export async function githubGet(
  path: string,
  missing: 'REPOSITORY_UNAVAILABLE' | 'BRANCH_NOT_FOUND' = 'REPOSITORY_UNAVAILABLE',
) {
  const signal = AbortSignal.timeout(8000)
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'User-Agent': 'GitCheck',
  })
  const token = process.env.GITHUB_TOKEN?.trim()
  if (token) headers.set('Authorization', 'Bearer ' + token)

  try {
    const response = await fetch(apiOrigin + path, { headers, signal, redirect: 'manual' })
    if (response.ok) {
      try {
        const data: unknown = await response.json()
        return { data, link: response.headers.get('link') }
      } catch (error) {
        if (error instanceof SyntaxError) throw new ApiError('GITHUB_UPSTREAM_ERROR')
        throw error
      }
    }
    if (response.status === 429 || (response.status === 403 && (
      response.headers.get('x-ratelimit-remaining') === '0'
      || response.headers.has('retry-after')
      || /rate limit/i.test(await response.text())
    ))) throw new ApiError('GITHUB_RATE_LIMITED')
    if (response.status === 404) throw new ApiError(missing)
    if ([301, 302, 307, 308, 401, 403, 410, 451].includes(response.status)) {
      throw new ApiError('REPOSITORY_UNAVAILABLE')
    }
    throw new ApiError('GITHUB_UPSTREAM_ERROR')
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(signal.aborted ? 'GITHUB_TIMEOUT' : 'GITHUB_NETWORK_ERROR')
  }
}
