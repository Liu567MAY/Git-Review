<script setup lang="ts">
import { ref } from 'vue'
import type { Report, Category, Severity } from './api'
import ReportSummary from './ReportSummary.vue'
import CheckOverview from './CheckOverview.vue'
import DualAgent from './dual-agent/DualAgent.vue'
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
    <RiskList :risks="report.risks" :filter="filter" :partial="report.partial" />
    <DualAgent :snapshot-id="report.snapshotId" />
  </article>
</template>
