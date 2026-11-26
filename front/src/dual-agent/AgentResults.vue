<script setup lang="ts">
import { ref } from 'vue'
import type { Row } from './events'
defineProps<{audit:Row[]|null; advice:Row[]|null}>()
const tab = ref<'audit'|'advice'>('audit')
</script>
<template>
  <div class="ag-results">
    <div class="ag-resultnav">
      <button :class="{active:tab==='audit'}" :aria-pressed="tab==='audit'" @click="tab='audit'">README 审查报告 <span class="ag-count">{{ audit?.length ?? '—' }}</span></button>
      <button :class="{active:tab==='advice'}" :aria-pressed="tab==='advice'" @click="tab='advice'">修改建议 <span class="ag-count">{{ advice?.length ?? '—' }}</span></button>
    </div>
    <div v-if="!(tab==='audit'?audit:advice)?.length" class="ag-empty">{{ tab==='audit' ? audit?'无 README 声明可供审查。':'等待审查结果。' : advice?'审查通过，暂无修改建议。':'等待修改建议。' }}</div>
    <details v-for="row in (tab==='audit'?audit:advice)" :key="tab+row.claim">
      <summary class="ag-resultrow"><span><span class="ag-pill" :class="row.tone">{{ row.status }}</span></span><strong>{{ row.claim }}</strong><code>{{ row.file }}</code><span aria-hidden="true">⌄</span></summary>
      <div class="ag-evidence">
        <template v-if="row.evidence"><b>依据</b><div class="ag-source">{{ row.evidence }}</div><p>{{ row.note }}</p></template>
        <template v-else><b>{{ row.diff ? '原因与方案' : '核实建议' }}</b><p>{{ row.why }}</p>
          <p v-if="row.verification"><b>验证步骤</b> · {{ row.verification }}</p>
          <div v-if="row.diff" class="ag-diff" aria-label="局部 Diff">
            <div>{{ row.diff.path }} · {{ row.diff.startLine }}</div>
            <div v-for="line in row.diff.lines" :key="line.kind + line.line" :class="line.kind === 'add' ? 'plus' : 'minus'">{{ line.kind === 'add' ? '+' : '−' }} {{ line.line }} {{ line.content }}</div>
          </div>
        </template>
      </div>
    </details>
  </div>
</template>