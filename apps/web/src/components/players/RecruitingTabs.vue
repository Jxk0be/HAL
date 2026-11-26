<script setup lang="ts">
/** Switches between the two recruiting boards: players looking for teams, and teams looking for players. */
const links = [
  { to: '/free-agents', label: 'Free agents' },
  { to: '/teams-recruiting', label: 'Teams recruiting' },
] as const
</script>

<template>
  <nav aria-label="Recruiting boards" class="flex gap-1 border-b border-line">
    <RouterLink
      v-for="l in links"
      :key="l.to"
      :to="l.to"
      class="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
      exact-active-class="!border-accent !text-text"
    >
      {{ l.label }}
    </RouterLink>
  </nav>
</template>
