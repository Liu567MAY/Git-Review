<script setup lang="ts">
import { categories, type Category, type Report } from './api'
defineProps<{ report: Report }>()
const emit = defineEmits<{ category: [Category] }>()
</script>

<template>
  <section class="section">
    <div class="sectionhead"><h2>检测结果总览</h2><span class="eyebrow">4 MODULES</span></div>
    <div class="panel">
      <div class="check tablehead"><span>模块</span><span>检测结果</span><span>状态</span></div>
      <details v-for="(label, category) in categories" :key="category">
        <summary class="check"><b>{{ label }}</b><span class="result">{{ report.checks[category].map(item => item.name).join(' / ') }}</span><span class="state">{{ report.checks[category].some(item => item.status === '无法判断') ? '无法判断' : report.checks[category][0].status }}</span><span aria-hidden="true">⌄</span></summary>
        <div class="inside">
          <p v-for="item in report.checks[category]" :key="item.name"><b>{{ item.name }}</b> · {{ item.status }} · {{ item.evidence }}</p>
          <button class="linkbtn" @click="emit('category', category)">筛选{{ label }}风险 ↘</button>
        </div>
      </details>
    </div>
  </section>
</template>