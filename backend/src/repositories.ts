import { ApiError, githubGet } from './github.ts'

const ownerPattern = /^[a-z0-9-]+$/i
const repoPattern = /^[a-z0-9_.-]+$/i

function repositoryPath(owner: string, repo: string) {
  if (!ownerPattern.test(owner) || !repoPattern.test(repo) || /^\.+$/.test(repo)) {
    throw new ApiError('INVALID_REPOSITORY')
  }
  return '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
}

export function fields(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ApiError('GITHUB_UPSTREAM_ERROR')
  }
  return data as Record<string, unknown>
}

async function publicRepository(owner: string, repo: string) {
  const { data } = await githubGet(repositoryPath(owner, repo))
  const metadata = fields(data)
  if (metadata.private === true || metadata.visibility === 'private' || metadata.visibility === 'internal') {
    throw new ApiError('REPOSITORY_NOT_PUBLIC')
  }
  if (metadata.private !== false || (metadata.visibility !== undefined && metadata.visibility !== 'public')
    || typeof metadata.full_name !== 'string' || typeof metadata.default_branch !== 'string'
    || !metadata.default_branch) {
    throw new ApiError('GITHUB_UPSTREAM_ERROR')
  }
  const parts = metadata.full_name.split('/')
  if (parts.length !== 2 || !ownerPattern.test(parts[0]) || !repoPattern.test(parts[1]) || /^\.+$/.test(parts[1])) {
    throw new ApiError('GITHUB_UPSTREAM_ERROR')
  }
  return { name: metadata.full_name, defaultBranch: metadata.default_branch }
}

export async function resolveRepository(url: unknown) {
  if (url === undefined || (typeof url === 'string' && !url.trim())) {
    throw new ApiError('REPOSITORY_URL_REQUIRED')
  }
  const match = typeof url === 'string'
    ? /^https:\/\/github\.com\/([a-z0-9-]+)\/([a-z0-9_.-]+)\/?$/i.exec(url.trim())
    : null
  const repo = match?.[2].replace(/\.git$/i, '')
  if (!match || !repo || /^\.+$/.test(repo)) throw new ApiError('INVALID_REPOSITORY_URL')
  return publicRepository(match[1], repo)
}

export async function listBranches(owner: string, repo: string, page: number) {
  if (!Number.isSafeInteger(page) || page < 1 || page >= Number.MAX_SAFE_INTEGER) {
    throw new ApiError('INVALID_PAGE')
  }
  const repository = await publicRepository(owner, repo)
  const { data, link } = await githubGet(`/repos/${repository.name}/branches?per_page=30&page=${page}`)
  if (!Array.isArray(data)) throw new ApiError('GITHUB_UPSTREAM_ERROR')
  const names = data.map((branch: unknown) => {
    const name = fields(branch).name
    if (typeof name !== 'string' || !name) throw new ApiError('GITHUB_UPSTREAM_ERROR')
    return name
  })
  const next = link && /<[^>]+>\s*;\s*rel="next"/i.test(link) ? String(page + 1) : undefined
  return { names, next, defaultBranch: repository.defaultBranch }
}

export async function resolveBranchVersion(owner: string, repo: string, branch: string) {
  return (await resolveBranch(owner, repo, branch)).commit
}

export async function resolveBranch(owner: string, repo: string, branch: string) {
  if (!branch || branch === '.' || branch === '..') throw new ApiError('INVALID_BRANCH')
  const repository = await publicRepository(owner, repo)
  const { data } = await githubGet(
    `/repos/${repository.name}/branches/${encodeURIComponent(branch)}`, 'BRANCH_NOT_FOUND',
  )
  const sha = fields(fields(data).commit).sha
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha)) {
    throw new ApiError('GITHUB_UPSTREAM_ERROR')
  }
  return { repository: repository.name, commit: sha }
}
