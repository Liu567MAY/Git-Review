<script setup lang="ts">
defineProps<{ status: string; failed: boolean }>()
</script>

<template>
  <div class="notice" :class="{ high: failed }" role="status">{{ status }}</div>
</template>