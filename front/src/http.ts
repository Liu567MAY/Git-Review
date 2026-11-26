import type { ScanApi } from './api'

const publicRepositoryErrors = new Set(['REPOSITORY_NOT_PUBLIC', 'REPOSITORY_UNAVAILABLE'])
const errorMessages: Record<string, string> = {
  REPOSITORY_URL_REQUIRED: '请输入 GitHub 仓库链接',
  INVALID_REPOSITORY_URL: '请输入有效的 GitHub 仓库主页 HTTPS 链接',
  INVALID_REPOSITORY: '仓库名称无效，请重新查询',
  INVALID_PAGE: '分支页码无效，请刷新分支列表',
  INVALID_REQUEST: '请求格式无效',
  REPOSITORY_NOT_PUBLIC: '该仓库为非公开仓库，请输入公开的 GitHub 仓库链接',
  REPOSITORY_UNAVAILABLE: '无法访问该仓库，请检查链接并确认仓库已公开',
  GITHUB_RATE_LIMITED: 'GitHub API 请求暂时受限，请稍后手动重试',
  GITHUB_TIMEOUT: 'GitHub 请求超时，请重试',
  GITHUB_NETWORK_ERROR: 'GitHub 网络连接失败，请重试',
  GITHUB_UPSTREAM_ERROR: 'GitHub 响应异常，请重试',
  INVALID_BRANCH: '分支名称无效，请重新选择分支',
  BRANCH_NOT_FOUND: '所选分支已不存在，请刷新分支列表',
  TREE_UNAVAILABLE: '无法读取所选版本的提交对象或文件树，请重试扫描',
  BACKEND_UNREACHABLE: '无法连接 GitCheck 后端。请在 backend/ 目录运行 npm run dev，再重试。',
  REQUEST_FAILED: '本次请求失败，请重试。',
  INTERNAL_ERROR: '服务暂时不可用，请稍后重试',
}

export class RepositoryApiError extends Error {
  constructor(readonly code: string, message?: string, retryAt?: Date) {
    super(retryAt
      ? `GitHub API 请求暂时受限，请在 ${retryAt.toLocaleString('zh-CN')} 后手动重试。`
      : errorMessages[code] ?? (message || '服务暂时不可用，请稍后重试'))
  }

  get invalidatesRepository() {
    return publicRepositoryErrors.has(this.code)
  }
}

async function proxyFailure() {
  const healthy = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(3000) })
    .then(async response => response.ok && (await response.json())?.status === 'ok')
    .catch(() => false)
  return new RepositoryApiError(healthy ? 'REQUEST_FAILED' : 'BACKEND_UNREACHABLE')
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, options)
  } catch {
    throw await proxyFailure()
  }
  const body = await response.json().catch(() => null)
  if (typeof body?.error?.code === 'string') {
    const retryAfter = response.headers.get('Retry-After')
    if (body.error.code === 'GITHUB_RATE_LIMITED' && retryAfter && /^\d+$/.test(retryAfter)) {
      const retryAt = new Date(Date.now() + Number(retryAfter) * 1000)
      if (Number.isFinite(retryAt.getTime())) {
        throw new RepositoryApiError(body.error.code, body.error.message, retryAt)
      }
    }
    throw new RepositoryApiError(body.error.code, body.error.message)
  }
  if (response.status >= 500 && body === null) throw await proxyFailure()
  if (!response.ok || body === null) {
    throw new RepositoryApiError('REQUEST_FAILED')
  }
  return body as T
}

export const httpApi: ScanApi = {
  repository(name, url) {
    return request('/api/repositories/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url ?? 'https://github.com/' + name }),
    })
  },
  branches(repo, cursor) {
    const name = repo.name.split('/').map(encodeURIComponent).join('/')
    const query = cursor === undefined ? '' : '?' + new URLSearchParams({ page: cursor })
    return request('/api/repositories/' + name + '/branches' + query)
  },
  scan(repo, branch) {
    const name = repo.name.split('/').map(encodeURIComponent).join('/')
    return request('/api/repositories/' + name + '/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
    })
  },
}
