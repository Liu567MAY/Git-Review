<script setup lang="ts">
defineProps<{ branches: string[]; more: boolean; busy: boolean; canRefresh: boolean }>()
const url = defineModel<string>('url', { required: true })
const branch = defineModel<string>('branch', { required: true })
const emit = defineEmits(['lookup', 'scan', 'more', 'refresh'])
</script>

<template>
  <form class="searchbar" @submit.prevent="emit('lookup')">
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#656d76" stroke-width="1.6" aria-hidden="true"><path d="M10 7H7a5 5 0 0 0 0 10h4m3-10h3a5 5 0 0 1 0 10h-4M8 12h8"/></svg>
    <input v-model="url" aria-label="GitHub 仓库地址" placeholder="https://github.com/owner/repository">
    <button class="primary" :disabled="busy">查询仓库 ↗</button>
  </form>
  <div v-if="canRefresh" class="branchbar">
    <template v-if="branches.length">
      <label>分支 <select v-model="branch" :disabled="busy" aria-label="分支"><option v-for="name in branches" :key="name">{{ name }}</option></select></label>
      <button v-if="more" :disabled="busy" @click="emit('more')">加载更多</button>
    </template>
    <button :disabled="busy" @click="emit('refresh')">刷新分支</button>
    <button v-if="branches.length" class="primary" :disabled="busy" @click="emit('scan')">开始扫描 ↗</button>
  </div>
</template>