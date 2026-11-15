<script setup lang="ts">
// ============================================================
// PageShareBar — 自包含页面分享栏
// 封装返回链接 + 分享按钮，分享模式下自动隐藏
// 页面只需一行引入，所有分享逻辑内部处理
// ============================================================

import { ref, computed, onMounted } from 'vue'
import shareMap from '../data/share-map.json'
import SharePanel from './SharePanel.vue'

// GitHub Pages 子路径部署：拼接 base 前缀（本地 dev 为 '/'）
const BASE = import.meta.env.BASE_URL

interface Props {
  slug: string
  type: 'tool' | 'demo'
  backUrl?: string
  backText?: string
}

const props = withDefaults(defineProps<Props>(), {
  backText: '返回工具列表',
})

// withDefaults 不能引用本地变量，默认返回链接在 computed 中归底
const backHref = computed(() => props.backUrl ?? `${BASE}tools/`)

// SSR 安全：初始值为空，客户端挂载后填充
const siteOrigin = ref('')
const isShareMode = ref(false)

onMounted(() => {
  siteOrigin.value = window.location.origin
  isShareMode.value = new URLSearchParams(window.location.search).get('mode') === 'share'
})

// 内部查找分享 token，生成公开分享 URL
const shareEntry = Object.entries(shareMap).find(
  ([_, v]) => v.type === props.type && v.target === props.slug
)
const publicShareUrl = computed(() => {
  if (!shareEntry || !siteOrigin.value) return ''
  // 尾斜杠与 trailingSlash: 'always' 一致，避免 GitHub Pages 301 跳转
  return `${siteOrigin.value}${BASE}s/${shareEntry[0]}/`
})
const shareTarget = `${props.type === 'tool' ? 't' : 'd'}:${props.slug}`
</script>

<template>
  <div v-if="!isShareMode" class="flex items-center justify-between mb-6">
    <!-- 返回链接 -->
    <a
      :href="backHref"
      class="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 hover:text-accent-dark dark:hover:text-accent transition-colors"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      {{ backText }}
    </a>

    <!-- 分享按钮 -->
    <SharePanel
      v-if="publicShareUrl"
      :publicShareUrl="publicShareUrl"
      :target="shareTarget"
    />
  </div>
</template>
