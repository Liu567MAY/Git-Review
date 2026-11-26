<script setup lang="ts">
import { examples } from './mock'
defineProps<{ branches: string[]; more: boolean; busy: boolean }>()
const url = defineModel<string>('url', { required: true })
const branch = defineModel<string>('branch', { required: true })
const emit = defineEmits(['lookup', 'scan', 'more', 'refresh'])
function example(event: Event) {
  const select = event.target as HTMLSelectElement
  url.value = 'https://github.com/example/' + select.value
  select.value = ''
  emit('lookup')
}
</script>

<template>
  <form class="searchbar" @submit.prevent="emit('lookup')">
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#656d76" stroke-width="1.6" aria-hidden="true"><path d="M10 7H7a5 5 0 0 0 0 10h4m3-10h3a5 5 0 0 1 0 10h-4M8 12h8"/></svg>
    <input v-model="url" aria-label="GitHub 仓库地址" placeholder="https://github.com/owner/repository">
    <button class="primary">查询仓库 ↗</button>
  </form>
  <div class="branchbar">
    <select aria-label="体验示例" value="" @change="example">
      <option value="" disabled>体验示例 · Mock</option>
      <option v-for="(label, key) in examples" :key="key" :value="key">{{ label }}</option>
    </select>
    <template v-if="branches.length">
      <label>分支 <select v-model="branch" aria-label="分支"><option v-for="name in branches" :key="name">{{ name }}</option></select></label>
      <button v-if="more" :disabled="busy" @click="emit('more')">加载更多</button>
      <button :disabled="busy" @click="emit('refresh')">刷新分支</button>
      <button class="primary" @click="emit('scan')">开始扫描 ↗</button>
    </template>
  </div>
</template>