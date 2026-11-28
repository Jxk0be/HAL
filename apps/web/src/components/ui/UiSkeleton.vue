<script setup lang="ts">
withDefaults(defineProps<{ lines?: number }>(), { lines: 1 })
</script>

<template>
  <div class="flex flex-col gap-2" aria-hidden="true">
    <div
      v-for="n in lines"
      :key="n"
      class="skeleton h-4 rounded-sm"
      :class="n === lines && lines > 1 ? 'w-2/3' : 'w-full'"
    />
  </div>
</template>
