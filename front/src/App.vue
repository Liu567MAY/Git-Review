<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { parseRepository, type Report, type Repository } from './api'
import { httpApi, RepositoryApiError } from './http'
import RepositoryInput from './RepositoryInput.vue'
import ScanStatus from './ScanStatus.vue'
import ReportView from './ReportView.vue'
import { historyLimit, loadHistory, saveHistory, type HistoryEntry } from './history/storage'
import ScanBackground from './ScanBackground.vue'

const url = ref('')
const branch = ref('')
const branches = ref<string[]>([])
const repository = ref<Repository>()
const cursor = ref<string>()
const report = ref<Report>()
const history = ref(loadHistory())
const historySaved = ref(true)
const view = ref('home')
const status = ref('输入公开 GitHub 仓库链接。')
const privateDialog = ref<HTMLDialogElement>()
const phase = ref('idle')
const busy = computed(() => ['validating', 'loading', 'scanning'].includes(phase.value))
let request = 0

function remember(entry: HistoryEntry) {
  history.value = [entry, ...history.value].slice(0, historyLimit)
  historySaved.value = saveHistory(history.value)
}

function resetRepository() {
  request++
  repository.value = undefined
  branch.value = ''
  branches.value = []
  cursor.value = undefined
  report.value = undefined
  phase.value = 'idle'
  status.value = '等待查询仓库'
}
watch(url, () => {
  resetRepository()
}, { flush: 'sync' })

function fail(id: number, error: unknown) {
  if (id !== request) return
  if (error instanceof RepositoryApiError && error.invalidatesRepository) resetRepository()
  phase.value = 'failed'
  if (error instanceof RepositoryApiError && error.code === 'REPOSITORY_NOT_PUBLIC') {
    privateDialog.value?.showModal()
  }
  status.value = error instanceof Error ? error.message : '请求失败，请重试'
}

async function lookup() {
  if (busy.value) return
  const id = ++request
  try {
    const name = parseRepository(url.value)
    phase.value = 'validating'
    status.value = '正在校验仓库公开性…'
    const result = await httpApi.repository(name, url.value.trim())
    if (id !== request) return
    if (repository.value && repository.value.name !== result.name) {
      branch.value = ''
      branches.value = []
      cursor.value = undefined
      report.value = undefined
    }
    repository.value = result
    remember({ kind: 'query', repo: result, url: url.value.trim(), at: new Date().toISOString() })
    await loadBranches()
  } catch (error) {
    fail(id, error)
  }
}

async function loadBranches(append = false) {
  const repo = repository.value
  if (!repo) return
  const id = ++request
  phase.value = 'loading'
  status.value = '正在加载分支…'
  try {
    const page = await httpApi.branches(repo, append ? cursor.value : undefined)
    if (id !== request) return
    const defaultBranch = branches.value.length ? page.defaultBranch ?? repo.defaultBranch : repo.defaultBranch
    repository.value = { ...repo, defaultBranch }
    branches.value = [...new Set([defaultBranch, ...(append ? branches.value : []), ...page.names])]
    if (!branches.value.includes(branch.value)) branch.value = defaultBranch
    cursor.value = page.next
    phase.value = 'ready'
    status.value = '仓库已通过公开性校验，可以选择分支并扫描'
  } catch (error) {
    fail(id, error)
  }
}

async function scan() {
  const repo = repository.value
  if (!repo || !branch.value || busy.value) return
  const id = ++request
  const selected = branch.value
  phase.value = 'scanning'
  status.value = '正在扫描 ' + selected + '，请稍候…'
  try {
    const result = await httpApi.scan(repo, selected)
    if (id !== request) return
    report.value = result
    remember({ kind: 'report', report: result })
    phase.value = 'done'
    status.value = result.partial ? '部分扫描完成 · 分数暂定' : '扫描完成'
  } catch (error) {
    fail(id, error)
  }
}

function repeatQuery(link: string) {
  url.value = link
  view.value = 'home'
  void lookup()
}

async function openReport(item: Report) {
  report.value = item
  view.value = 'home'
  await nextTick()
  document.getElementById('report')?.scrollIntoView()
}
</script>

<template>
  <div id="shell">
    <ScanBackground :scanning="phase === 'scanning'" />
    <header>
      <div class="brand"><span class="logo"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 7v10m12-9c0 6-12 3-12 9"/><path d="m13 18 3 3 5-6" stroke="#7ee787"/></svg></span>GitCheck</div>
      <nav aria-label="主导航"><button :class="{ active: view === 'home' }" @click="view = 'home'">仓库审查</button><button :class="{ active: view === 'history' }" @click="view = 'history'">报告记录</button></nav>
    </header>
    <main>
      <div v-show="view === 'home'">
        <section class="hero">
          <h1>Know your code.<br>Before you integrate<span class="green">.</span></h1>
          <p>理解仓库结构，识别潜在风险。<br>为每一次代码接入提供可靠依据。</p>
          <RepositoryInput v-model:url="url" v-model:branch="branch" :branches="branches" :more="!!cursor" :busy="busy" :can-refresh="!!repository" @lookup="lookup()" @scan="scan" @more="!busy && loadBranches(true)" @refresh="!busy && loadBranches()" />
          <ScanStatus :status="status" :failed="phase === 'failed'" />
        </section>
        <ReportView v-if="report" :key="report.scannedAt + report.branch" :report="report" />
      </div>
      <div v-if="view === 'history'" class="wrap archive">
        <h1>审查记录<span class="green">.</span></h1>
        <p class="muted">当前浏览器保存的最近 {{ historyLimit }} 条查询与扫描记录</p>
        <p v-if="!historySaved" class="high" role="status">浏览器存储不可用，最新记录仅在当前页面保留。</p><p v-if="!history.length" class="panel empty">查询公开仓库或完成扫描后，记录会显示在这里。</p>
        <div v-for="(item, index) in history" :key="index" class="panel archiveitem">
          <template v-if="item.kind === 'report'">
            <div><b>{{ item.report.repository }}</b><div class="eyebrow">{{ item.report.branch }} · {{ item.report.commit }} · {{ item.report.score }} 分{{ item.report.partial ? ' · 暂定' : '' }}</div></div>
            <button @click="openReport(item.report)">查看报告 ↗</button>
          </template>
          <template v-else>
            <div><b>{{ item.repo.name }}</b><div class="eyebrow">仓库查询 · {{ new Date(item.at).toLocaleString() }}</div></div>
            <button @click="repeatQuery(item.url)">重新查询 ↗</button>
          </template>
        </div>
      </div>
    </main>
    <dialog ref="privateDialog" class="repository-dialog" aria-labelledby="private-dialog-title" aria-describedby="private-dialog-message">
      <h2 id="private-dialog-title"><span class="warning-icon" aria-hidden="true">!</span> 仓库非公开</h2>
      <p id="private-dialog-message">该仓库为非公开仓库，请输入公开的 GitHub 仓库链接。</p>
      <form method="dialog"><button class="primary" autofocus>确定</button></form>
    </dialog>
    <footer><span>GITCHECK / ENGINEERING TOOLS</span><span>SCAN. REVIEW. INTEGRATE.</span></footer>
  </div>
</template>
