import { randomUUID } from 'node:crypto'
import type { analyze } from './scan-rules.ts'

export type Snapshot = {
  repository: string; branch: string; commit: string; treeTruncated: boolean
  tree: readonly Readonly<Record<string, unknown>>[]
  files: readonly { path: string; sha: unknown; size: unknown; regular: boolean }[]
  texts: ReadonlyMap<string, string>
  report: ReturnType<typeof analyze> & { partial: boolean; limits: string[]; read: number; skipped: number; failed: number }
}

const ttl = 15 * 60 * 1000
const capacity = 8
const snapshots = new Map<string, { expires: number; data: Snapshot; timer: NodeJS.Timeout }>()

function remove(id: string) {
  clearTimeout(snapshots.get(id)?.timer)
  snapshots.delete(id)
}

export function saveSnapshot(data: Snapshot) {
  const id = randomUUID()
  const now = Date.now()
  for (const [key, entry] of snapshots) if (entry.expires <= now) remove(key)
  if (snapshots.size >= capacity) remove(snapshots.keys().next().value!)
  const timer = setTimeout(() => remove(id), ttl).unref()
  snapshots.set(id, { expires: now + ttl, data, timer })
  return id
}

export function getSnapshot(id: string) {
  const entry = snapshots.get(id)
  if (entry && entry.expires > Date.now()) return entry.data
  remove(id)
}
