<script setup lang="ts">
import { ref } from 'vue'
import type { Report, Category, Severity } from './api'
import ReportSummary from './ReportSummary.vue'
import CheckOverview from './CheckOverview.vue'
import RiskList from './RiskList.vue'

defineProps<{ report: Report }>()
const filter = ref<{ category: Category | 'all'; severity: Severity | 'all' }>({ category: 'all', severity: 'all' })
function select(category: Category | 'all', severity: Severity | 'all' = 'all') {
  filter.value = { category, severity }
  document.getElementById('findings')?.scrollIntoView()
}
</script>

<template>
  <article id="report" class="wrap">
    <ReportSummary :report="report" @severity="select('all', $event)" />
    <CheckOverview :report="report" @category="select($event)" />
    <RiskList :risks="report.risks" :filter="filter" :partial="report.failed > 0" />
    <details class="section panel ai" open>
      <summary>AI 接入建议 <span class="muted">· Mock 演示</span></summary>
      <p v-for="risk in report.risks.slice(0, 3)" :key="risk.rule"><b>{{ risk.title }}</b> · {{ risk.advice }}</p>
      <p v-if="!report.risks.length">保留 README 中的安装与启动信息，以便复现接入步骤。</p>
    </details>
  </article>
</template>