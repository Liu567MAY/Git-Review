<script setup lang="ts">
import { computed } from 'vue'
import type { Report, Severity } from './api'
const props = defineProps<{ report: Report }>()
const emit = defineEmits<{ severity: [Severity] }>()
const levels = [
  { key: 'HIGH', label: '高危', color: '#cf222e' },
  { key: 'MED', label: '中危', color: '#bf8700' },
  { key: 'LOW', label: '低危', color: '#8c959f' },
] as const
const distribution = computed(() => levels.map(level => ({
  ...level, count: props.report.risks.filter(risk => risk.level === level.key).length,
})))
</script>

<template>
  <div class="reporthead">
    <div><div class="eyebrow">ANALYSIS REPORT{{ report.example ? ' · MOCK 示例' : '' }}</div><h2>{{ report.repository }}</h2></div>
    <div class="report-ref"><span class="tag">{{ report.branch }} · {{ report.commit }}</span><div class="eyebrow">{{ new Date(report.scannedAt).toLocaleString() }}</div></div>
  </div>
  <div class="panel summary">
    <div class="score">
      <div class="eyebrow">INTEGRATION READINESS / 接入就绪度</div>
      <div class="scorerow">
        <div class="big">{{ report.score }}<span class="green">.</span><small>/100</small></div>
        <b :class="{ high: distribution[0].count }">{{ report.partial ? '暂定 · 部分扫描' : distribution[0].count ? '暂不建议直接接入' : report.risks.length ? '建议核对待确认风险' : '没有发现风险' }}</b>
      </div>
      <div class="segments" aria-hidden="true"><i v-for="segment in 25" :key="segment" :class="{ filled: segment * 4 <= report.score }"></i></div>
      <div v-if="report.risks.length" class="priority"><b>优先处理</b> · {{ report.risks[0].title }}</div>
      <details class="deductions"><summary>评分与扣分依据</summary>
        <p>满分 100 · 接入资料 40 · 可移植性 30 · 敏感信息 30</p>
        <ul v-if="report.risks.length"><li v-for="risk in report.risks" :key="risk.rule">{{ risk.rule }} · {{ risk.title }} −{{ risk.deduction }}</li></ul>
        <p v-else>已覆盖的检测项无扣分。</p>
      </details>
    </div>
    <div class="distribution">
      <div class="eyebrow">RISK DISTRIBUTION / 风险分布</div>
      <div><strong class="distribution-count">{{ report.risks.length }}</strong> <span class="muted">项待确认风险</span></div>
      <div class="distbar" v-if="report.risks.length">
        <button v-for="level in distribution.filter(item => item.count)" :key="level.key" :style="{ flex: level.count, background: level.color }" :aria-label="'筛选' + level.label + '风险'" @click="emit('severity', level.key)"></button>
      </div>
      <div class="legend"><button v-for="level in distribution" :key="level.key" @click="emit('severity', level.key)"><b :class="level.key.toLowerCase()">{{ level.count }}</b>{{ level.label }}</button></div>
      <div class="meta"><div><b>{{ report.read }}</b><span>已读取文本文件</span></div><div><b>{{ report.skipped }}</b><span>跳过文件</span></div><div><b>{{ report.failed }}</b><span>读取失败</span></div></div>
      <p class="muted">覆盖范围 · {{ report.limits.join('；') }}</p>
    </div>
  </div>
</template>
