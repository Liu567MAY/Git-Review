<script setup lang="ts">
defineProps<{ status: string; progress: number; pipeline: boolean; failed: boolean }>()
const steps = ['获取仓库及 Commit 信息', '检查项目文件完整性', '分析跨平台兼容性', '匹配硬编码路径', '检测敏感信息', '聚合评分与报告']
</script>

<template>
  <div class="notice" :class="{ high: failed }" role="status">Mock · {{ status }}</div>
  <div v-if="pipeline" class="scanbox">
    <div class="sectionhead"><b class="mono">ANALYSIS PIPELINE · 演示进度</b><span class="mono green">{{ progress }}%</span></div>
    <div class="scantrack" role="progressbar" aria-label="演示进度" :aria-valuenow="progress"><i :style="{ width: progress + '%' }"></i></div>
    <div v-for="(step, index) in steps" :key="step" class="scanline" :class="{ done: Math.round(progress * 6 / 100) > index, current: !failed && Math.round(progress * 6 / 100) === index }">
      <span>{{ Math.round(progress * 6 / 100) > index ? '✓' : '·' }}</span>{{ step }}
    </div>
  </div>
</template>