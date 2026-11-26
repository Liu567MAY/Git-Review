<script setup lang="ts">
import { computed } from 'vue'
import type { Animation } from './events'
const props = defineProps<{ actor:'clawd'|'whale'; animation:Animation }>()
const assets = import.meta.glob<string>('./assets/*.gif', {eager:true, query:'?url', import:'default'})
const style = { IDLE:'idle', SCAN:'running', REVIEW:'review', REPORT:'done' }
const labels = { IDLE:'空闲', SCAN:'调查中', REVIEW:'复核中', REPORT:'已完成' }
const sprite = computed(() => {
  const clips = {IDLE:'idle-coffee',SCAN:'working-scan',REVIEW:'working-review',REPORT:'working-report'}
  return assets['./assets/'+props.actor+'-'+clips[props.animation]+'.gif']
})
</script>
<template>
  <article class="ag-card" :data-state="style[animation]">
    <div class="ag-top"><span class="ag-step">AGENT {{ actor === 'clawd' ? '01' : '02' }}</span><span class="ag-status">{{ labels[animation] }}</span></div>
    <div class="ag-person">
      <div class="ag-sprite ag-winter"><img :src="sprite" :alt="actor === 'clawd' ? '冬日 Clawd' : '大肥鱼'"><span class="ag-still">{{ actor === 'clawd' ? '冬日 Clawd' : '大肥鱼' }}</span></div>
      <div><h3>{{ actor === 'clawd' ? 'README 审查 Agent' : '修改建议 Agent' }}</h3><p>{{ actor === 'clawd' ? 'Audit · 证据验证' : 'Improve · 方案生成' }}</p></div>
    </div>
    <div class="ag-task">{{ actor === 'clawd' ? '读取 README，按需检索仓库验证文档描述。' : '综合 README 审查与静态扫描结果，生成修改建议。' }}</div>
  </article>
</template>