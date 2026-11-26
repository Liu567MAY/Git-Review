<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { parseRepository, type Report, type Repository } from './api'
import { api } from './mock'
import RepositoryInput from './RepositoryInput.vue'
import ScanStatus from './ScanStatus.vue'
import ReportView from './ReportView.vue'
import ScanBackground from './ScanBackground.vue'

const url = ref('')
const branch = ref('')
const branches = ref<string[]>([])
const repository = ref<Repository>()
const cursor = ref<string>()
const report = ref<Report>()
const history = ref<Report[]>([])
const view = ref('home')
const status = ref('输入 GitHub 仓库链接，或选择体验示例。所有查询和扫描均为模拟。')
const phase = ref('idle')
const progress = ref(0)
const pipeline = ref(false)
let request = 0

function resetRepository() {
  request++
  repository.value = undefined
  branch.value = ''
  branches.value = []
  cursor.value = undefined
  report.value = undefined
  phase.value = 'idle'
  pipeline.value = false
  status.value = '等待查询仓库'
}
watch(url, resetRepository, { flush: 'sync' })

function fail(id: number, error: unknown) {
  if (id !== request) return
  phase.value = 'failed'
  status.value = error instanceof Error ? error.message : '请求失败，请重试'
}

async function lookup() {
  resetRepository()
  const id = request
  try {
    const name = parseRepository(url.value)
    phase.value = 'validating'
    status.value = '正在校验仓库公开性…'
    const result = await api.repository(name)
    if (id !== request) return
    repository.value = result
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
  pipeline.value = false
  status.value = '正在加载分支…'
  try {
    const page = await api.branches(repo, append ? cursor.value : undefined)
    if (id !== request) return
    branches.value = append ? [...new Set([...branches.value, ...page.names])] : [...new Set([repo.defaultBranch, ...page.names])]
    if (!branches.value.includes(branch.value)) branch.value = repo.defaultBranch
    cursor.value = page.next
    phase.value = 'ready'
    status.value = '仓库已通过公开性校验，可以选择分支并扫描'
  } catch (error) {
    fail(id, error)
  }
}

async function scan() {
  const repo = repository.value
  if (!repo || !branch.value) return
  const id = ++request
  const selected = branch.value
  phase.value = 'scanning'
  pipeline.value = true
  progress.value = 0
  status.value = '正在扫描 ' + selected
  try {
    const result = await api.scan(repo, selected, percent => {
      if (id === request) progress.value = percent
    })
    if (id !== request) return
    report.value = result
    history.value.unshift(result)
    phase.value = 'done'
    status.value = result.failed ? '部分扫描完成 · 分数暂定' : result.risks.length ? '扫描完成' : '扫描完成 · 没有发现风险'
  } catch (error) {
    fail(id, error)
  }
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
          <RepositoryInput v-model:url="url" v-model:branch="branch" :branches="branches" :more="!!cursor" :busy="phase === 'loading' || phase === 'scanning'" @lookup="lookup" @scan="scan" @more="loadBranches(true)" @refresh="loadBranches()" />
          <ScanStatus :status="status" :pipeline="pipeline" :progress="progress" :failed="phase === 'failed'" />
        </section>
        <ReportView v-if="report" :key="report.scannedAt + report.branch" :report="report" />
      </div>
      <div v-if="view === 'history'" class="wrap archive">
        <h1>审查记录<span class="green">.</span></h1>
        <p class="muted">Mock · 当前会话的演示报告</p>
        <p v-if="!history.length" class="panel empty">完成一次示例扫描后即可查看报告记录。</p>
        <div v-for="(item, index) in history" :key="index" class="panel archiveitem">
          <div><b>{{ item.repository }}</b><div class="eyebrow">{{ item.branch }} · {{ item.commit }} · {{ item.score }} 分</div></div>
          <button @click="openReport(item)">查看报告 ↗</button>
        </div>
      </div>
    </main>
    <footer><span>GITCHECK / ENGINEERING TOOLS</span><span>SCAN. REVIEW. INTEGRATE.</span></footer>
  </div>
</template>