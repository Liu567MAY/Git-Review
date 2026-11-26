<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { categories, type Category, type Severity, type Risk } from './api'
const props = defineProps<{ risks: Risk[]; filter: { category: Category | 'all'; severity: Severity | 'all' }; partial: boolean }>()
const category = ref<Category | 'all'>('all')
const severity = ref<Severity | 'all'>('all')
const sort = ref('severity')
const query = ref('')
const rank = { HIGH: 0, MED: 1, LOW: 2 }
watch(() => props.filter, filter => {
  category.value = filter.category
  severity.value = filter.severity
  query.value = ''
})
function reset() {
  category.value = severity.value = 'all'
  sort.value = 'severity'
  query.value = ''
}
const results = computed(() => {
  const term = query.value.trim().toLowerCase()
  return props.risks.filter(risk =>
    (category.value === 'all' || risk.category === category.value)
    && (severity.value === 'all' || risk.level === severity.value)
    && [risk.title, risk.location, risk.rule].some(value => value.toLowerCase().includes(term)),
  ).sort((a, b) => sort.value === 'file' ? a.location.localeCompare(b.location)
    : (rank[a.level] - rank[b.level]) * (sort.value === 'reverse' ? -1 : 1))
})
</script>

<template>
  <section id="findings" class="section">
    <div class="sectionhead"><h2>风险审查</h2><span class="eyebrow">FINDINGS [{{ results.length }}/{{ risks.length }}]</span></div>
    <div class="toolbar">
      <div class="tabs">
        <button :class="{ active: category === 'all' }" :aria-pressed="category === 'all'" @click="category = 'all'">全部 {{ risks.length }}</button>
        <button v-for="(label, key) in categories" :key="key" :class="{ active: category === key }" :aria-pressed="category === key" @click="category = key">{{ label }}</button>
      </div>
      <div class="tools">
        <select v-model="severity" aria-label="风险等级"><option value="all">全部等级</option><option value="HIGH">高危风险</option><option value="MED">中危风险</option><option value="LOW">低危风险</option></select>
        <select v-model="sort" aria-label="排序"><option value="severity">严重程度排序</option><option value="file">文件路径排序</option><option value="reverse">低危优先</option></select>
        <input v-model="query" aria-label="搜索风险" placeholder="问题 / 文件 / 规则">
      </div>
    </div>
    <div class="panel">
      <div class="risk tablehead"><span>等级</span><span>问题</span><span>位置</span></div>
      <details v-for="risk in results" :key="risk.rule">
        <summary class="risk"><b :class="risk.level.toLowerCase()">{{ risk.level }}</b><b>{{ risk.title }}</b><code>{{ risk.location }}</code><span aria-hidden="true">⌄</span></summary>
        <div class="inside">
          <div class="eyebrow">{{ categories[risk.category] }} · {{ risk.rule }} · Mock 脱敏证据</div>
          <pre>{{ risk.evidence }}</pre>
          <b>修复建议</b><p>{{ risk.advice }}</p>
        </div>
      </details>
      <div v-if="!results.length" class="empty">{{ risks.length ? '当前筛选无结果' : partial ? '已覆盖范围内没有发现风险' : '没有发现风险' }}</div>
    </div>
    <div class="footnote"><span>显示 {{ results.length }} 条风险 · 点击展开详情</span><button class="linkbtn" @click="reset">重置筛选</button></div>
  </section>
</template>