<template>
  <router-view />
</template>

<script setup>
import { useParallaxBackground } from '@/composables/useParallaxBackground'

useParallaxBackground()
</script>
