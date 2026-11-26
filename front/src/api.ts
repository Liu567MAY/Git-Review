export const categories = {
  integrity: '接入资料', platform: 'Windows 脚本', path: '硬编码路径', security: '敏感信息',
} as const
export type Category = keyof typeof categories
export type Severity = 'HIGH' | 'MED' | 'LOW'
export type Risk = {
  category: Category
  level: Severity
  rule: string
  title: string
  location: string
  evidence: string
  advice: string
  deduction: number
}
export type Repository = { name: string; defaultBranch: string }
export type Report = {
  repository: string; branch: string; commit: string; scannedAt: string
  read: number; skipped: number; failed: number; limits: string[]
  score: number; risks: Risk[]
  partial: boolean; example?: boolean
  checks: Record<Category, { name: string; status: string; evidence: string }[]>
}
export interface ScanApi {
  repository(name: string, url?: string): Promise<Repository>
  branches(repo: Repository, cursor?: string): Promise<{ names: string[]; next?: string; defaultBranch?: string }>
  scan(repo: Repository, branch: string, progress?: (percent: number) => void): Promise<Report>
}

export function parseRepository(input: string) {
  if (!input.trim()) throw new Error('请输入 GitHub 仓库链接')
  const match = /^https:\/\/github\.com\/([a-z0-9-]+)\/([a-z0-9_.-]+)\/?$/i.exec(input.trim())
  const repo = match?.[2]?.replace(/\.git$/i, '')
  if (!match || !repo || /^\.+$/.test(repo)) throw new Error('请输入有效的 GitHub 仓库主页 HTTPS 链接')
  return (match[1] + '/' + repo).toLowerCase()
}
