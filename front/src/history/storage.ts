import type { Report, Repository } from '../api'

const key = 'gitcheck.history.v1'
export const historyLimit = 30

export type HistoryEntry =
  | { kind: 'query'; repo: Repository; url: string; at: string }
  | { kind: 'report'; report: Report }

export function loadHistory(): HistoryEntry[] {
  try {
    const entries: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(entries)) return []
    return entries.filter(entry => entry?.kind === 'query'
      ? typeof entry.repo?.name === 'string' && typeof entry.url === 'string' && typeof entry.at === 'string'
      : entry?.kind === 'report' && typeof entry.report?.commit === 'string'
        && Array.isArray(entry.report.risks) && Array.isArray(entry.report.limits) && entry.report.checks
    ).slice(0, historyLimit)
  } catch {
    return []
  }
}

export function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(entries))
    return true
  } catch {
    return false
  }
}
