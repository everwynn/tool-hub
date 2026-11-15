<script setup lang="ts">
// ============================================================
// HomeCatalog — 首页：搜索 + 分类总览 + 分组/筛选工具列表（无分页）
// ============================================================

import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { POPULAR_ORDER } from '../../data/tools'

// GitHub Pages 子路径部署：拼接 base 前缀（本地 dev 为 '/'）
const BASE = import.meta.env.BASE_URL

interface Tool {
  name: string
  slug: string
  icon: string
  category: string
  categoryLabel: string
  desc: string
  tags: string[]
  status: 'available' | 'planned'
  popular?: boolean
}

interface CatMeta {
  key: string
  label: string
  icon: string
  color: string
  desc: string
}

const props = defineProps<{ tools: Tool[]; categories: CatMeta[]; total: number }>()

// 分类配色（Tailwind 完整类名写死，避免动态拼接被裁剪）
const iconBg: Record<string, string> = {
  emerald: 'bg-emerald-50 dark:bg-emerald-900/20',
  blue: 'bg-blue-50 dark:bg-blue-900/20',
  amber: 'bg-amber-50 dark:bg-amber-900/20',
  pink: 'bg-pink-50 dark:bg-pink-900/20',
  red: 'bg-red-50 dark:bg-red-900/20',
  purple: 'bg-purple-50 dark:bg-purple-900/20',
  cyan: 'bg-cyan-50 dark:bg-cyan-900/20',
}

const countBadge: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  pink: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800',
  red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  purple: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800',
}

const searchQuery = ref('')
const activeCategory = ref('all')
const searchInput = ref<HTMLInputElement | null>(null)

/** 分组数据（分类顺序即展示顺序） */
const grouped = computed(() =>
  props.categories.map((c) => ({
    ...c,
    items: props.tools.filter((t) => t.category === c.key),
  })),
)

/** 是否处于筛选状态（搜索 or 选中分类） */
const isFiltering = computed(() => searchQuery.value.trim() !== '' || activeCategory.value !== 'all')

/** 平铺筛选结果 */
const filtered = computed(() => {
  let list = props.tools
  if (activeCategory.value !== 'all') {
    list = list.filter((t) => t.category === activeCategory.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.desc.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        t.categoryLabel.includes(q),
    )
  }
  return list
})

const popular = computed(() => {
  const rank = (s: string) => {
    const i = POPULAR_ORDER.indexOf(s)
    return i === -1 ? 99 : i
  }
  return props.tools.filter((t) => t.popular).sort((a, b) => rank(a.slug) - rank(b.slug))
})
const activeLabel = computed(() => props.categories.find((c) => c.key === activeCategory.value)?.label ?? '')

function scrollToCatalog() {
  document.getElementById('tool-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function pickCategory(key: string) {
  activeCategory.value = key
  scrollToCatalog()
}

function clearFilter() {
  activeCategory.value = 'all'
  searchQuery.value = ''
}

// 键盘快捷键：/ 或 Ctrl|⌘+K 聚焦搜索
function onKeydown(e: KeyboardEvent) {
  const tag = (document.activeElement?.tagName ?? '')
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.key === '/' || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
    e.preventDefault()
    searchInput.value?.focus()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div>
    <!-- 搜索框（视觉上属于 Hero 区，居中） -->
    <div class="max-w-[560px] mx-auto relative">
      <svg class="absolute left-[15px] top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-gray-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
      <input
        ref="searchInput"
        v-model="searchQuery"
        type="text"
        :placeholder="`搜索 ${total} 个工具，如 JSON、Base64、图片…`"
        class="w-full pl-11 pr-[74px] py-3 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
      />
      <button
        v-if="searchQuery"
        @click="searchQuery = ''"
        class="absolute right-12 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-slate-600 dark:hover:text-slate-400"
        aria-label="清空搜索"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
      <span class="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[11px] leading-none text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-700 rounded bg-gray-50 dark:bg-slate-800/50 select-none">⌘K</span>
    </div>

    <!-- 常用工具快捷链接行 -->
    <div class="mt-3 text-center text-xs text-gray-400 dark:text-slate-500">
      常用：
      <template v-for="(t, i) in popular" :key="t.slug">
        <a :href="`${BASE}tools/${t.slug}/`" class="text-gray-500 dark:text-slate-400 hover:text-accent-dark dark:hover:text-accent transition-colors">{{ t.name }}</a>
        <span v-if="i < popular.length - 1" class="mx-1.5 text-gray-300 dark:text-slate-700">·</span>
      </template>
    </div>

    <!-- 工具箱总览 -->
    <div id="tool-catalog" class="mt-14 scroll-mt-24">
      <div class="flex items-baseline gap-2.5 mb-4">
        <h2 class="text-lg font-bold text-gray-900 dark:text-white">工具箱总览</h2>
        <span class="text-xs text-gray-400 dark:text-slate-500">点击分类快速筛选</span>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          v-for="g in grouped"
          :key="g.key"
          @click="pickCategory(g.key)"
          :class="[
            'text-left rounded-xl border p-4 transition-all',
            activeCategory === g.key
              ? 'border-accent/60 ring-1 ring-accent/20 bg-white dark:bg-slate-900/50 shadow-md shadow-accent/5'
              : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-accent/40 hover:shadow-md hover:shadow-accent/5',
          ]"
        >
          <div class="flex items-center justify-between mb-2.5">
            <span :class="['w-[38px] h-[38px] rounded-[10px] flex items-center justify-center text-lg', iconBg[g.color] || '']">{{ g.icon }}</span>
            <span :class="['px-2 py-0.5 text-[11px] font-semibold rounded-full border', countBadge[g.color] || '']">{{ g.items.length }} 个工具</span>
          </div>
          <div class="text-[15px] font-bold text-gray-900 dark:text-white">{{ g.label }}</div>
          <div class="mt-1 text-xs text-gray-400 dark:text-slate-500 truncate">{{ g.desc }}</div>
        </button>
      </div>
    </div>

    <!-- 筛选状态栏 -->
    <div v-if="isFiltering" class="mt-9 flex items-center gap-3 flex-wrap">
      <span class="text-sm text-gray-500 dark:text-slate-400">
        <template v-if="activeCategory !== 'all'">{{ activeLabel }} · </template>
        <template v-if="searchQuery.trim()">「{{ searchQuery.trim() }}」 · </template>
        共 {{ filtered.length }} 个工具
      </span>
      <button @click="clearFilter" class="text-xs text-accent-dark dark:text-accent underline underline-offset-2">清除筛选</button>
    </div>

    <!-- 分组展示（默认） -->
    <template v-if="!isFiltering">
      <section v-for="g in grouped" :key="g.key" class="mt-10">
        <div class="flex items-center gap-2.5 mb-3">
          <span class="text-base">{{ g.icon }}</span>
          <h3 class="text-[15px] font-bold text-gray-900 dark:text-white">{{ g.label }}</h3>
          <span class="text-xs text-gray-400 dark:text-slate-500">{{ g.items.length }} 个工具</span>
          <span class="flex-1 h-px bg-gray-200 dark:bg-slate-800 ml-2"></span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <a
            v-for="t in g.items"
            :key="t.slug"
            :href="`${BASE}tools/${t.slug}/`"
            class="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 px-3.5 py-3 hover:border-accent/50 dark:hover:border-accent/40 hover:shadow-md hover:shadow-accent/5 transition-all group"
          >
            <span class="w-[34px] h-[34px] rounded-lg bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/50 flex items-center justify-center text-[17px] shrink-0">{{ t.icon }}</span>
            <span class="min-w-0">
              <span class="block text-[13.5px] font-semibold text-gray-900 dark:text-white truncate group-hover:text-accent-dark dark:group-hover:text-accent transition-colors">{{ t.name }}</span>
              <span class="block text-[11.5px] text-gray-400 dark:text-slate-500 truncate mt-0.5">{{ t.desc }}</span>
            </span>
          </a>
        </div>
      </section>
    </template>

    <!-- 平铺筛选结果 -->
    <template v-else>
      <div class="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <a
          v-for="t in filtered"
          :key="t.slug"
          :href="`${BASE}tools/${t.slug}/`"
          class="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 px-3.5 py-3 hover:border-accent/50 dark:hover:border-accent/40 hover:shadow-md hover:shadow-accent/5 transition-all group"
        >
          <span class="w-[34px] h-[34px] rounded-lg bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/50 flex items-center justify-center text-[17px] shrink-0">{{ t.icon }}</span>
          <span class="min-w-0">
            <span class="block text-[13.5px] font-semibold text-gray-900 dark:text-white truncate group-hover:text-accent-dark dark:group-hover:text-accent transition-colors">{{ t.name }}</span>
            <span class="block text-[11.5px] text-gray-400 dark:text-slate-500 truncate mt-0.5">{{ t.desc }}</span>
          </span>
        </a>
      </div>
      <div v-if="filtered.length === 0" class="py-16 text-center text-gray-400 dark:text-slate-600">
        <div class="text-4xl mb-3">🔍</div>
        <p class="text-sm">未找到匹配的工具</p>
        <button @click="clearFilter" class="mt-3 text-xs text-accent-dark dark:text-accent underline underline-offset-2">清除筛选</button>
      </div>
    </template>

    <!-- 底部安全提示 -->
    <div class="mt-12 p-4 rounded-xl bg-accent/5 border border-accent/15 text-sm text-gray-600 dark:text-slate-400 flex items-start gap-3">
      <svg class="w-5 h-5 text-accent mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <span>所有工具均在浏览器本地运行，<strong class="text-gray-700 dark:text-slate-300">不会上传任何数据到服务器</strong>，可放心使用。更多工具持续开发中，欢迎提需求。</span>
    </div>
  </div>
</template>
