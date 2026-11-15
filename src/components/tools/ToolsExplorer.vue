<script setup lang="ts">
// ============================================================
// ToolsExplorer — 工具列表：搜索 + 分类 + 分页
// ============================================================

import { ref, computed, watch } from 'vue'

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
  status: 'available' | 'coming-soon'
}

const props = withDefaults(defineProps<{ tools: Tool[]; pageSize?: number }>(), { pageSize: 9 })

const categoryColors: Record<string, string> = {
  devops:    'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  backend:   'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  common:    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  security:  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  frontend:  'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800',
}

const categories = [
  { key: 'all',      label: '全部' },
  { key: 'devops',   label: '运维' },
  { key: 'backend',  label: '后端' },
  { key: 'common',   label: '通用' },
  { key: 'security', label: '安全' },
  { key: 'frontend', label: '前端' },
]

const searchQuery    = ref('')
const activeCategory = ref('all')
const currentPage    = ref(1)

// 当搜索/分类变化时重置到第1页
watch([searchQuery, activeCategory], () => { currentPage.value = 1 })

const filtered = computed(() => {
  let list = props.tools
  if (activeCategory.value !== 'all') {
    list = list.filter(t => t.category === activeCategory.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.desc.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q)) ||
      t.categoryLabel.includes(q)
    )
  }
  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / props.pageSize)))

const paginated = computed(() => {
  const start = (currentPage.value - 1) * props.pageSize
  return filtered.value.slice(start, start + props.pageSize)
})

const pageNumbers = computed(() => {
  const total = totalPages.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const cur = currentPage.value
  const pages: (number | '...')[] = [1]
  if (cur > 3) pages.push('...')
  for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) pages.push(i)
  if (cur < total - 2) pages.push('...')
  pages.push(total)
  return pages
})

const goTo = (page: number | '...') => {
  if (typeof page === 'number') currentPage.value = page
}
</script>

<template>
  <div class="space-y-6">
    <!-- 搜索 + 分类 -->
    <div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      <!-- 搜索框 -->
      <div class="relative w-full sm:max-w-xs">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索工具名称、标签..."
          class="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-slate-600 dark:hover:text-slate-400"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- 分类按钮 -->
      <div class="flex flex-wrap gap-2">
        <button
          v-for="cat in categories"
          :key="cat.key"
          @click="activeCategory = cat.key"
          :class="[
            'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
            activeCategory === cat.key
              ? 'bg-accent text-white border-accent'
              : 'bg-white dark:bg-slate-900/50 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40'
          ]"
        >{{ cat.label }}</button>
      </div>

      <!-- 结果计数 -->
      <div class="ml-auto text-xs text-gray-400 dark:text-slate-600 flex-shrink-0">
        {{ filtered.length }} 个工具
      </div>
    </div>

    <!-- 卡片网格 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      <template v-for="tool in paginated" :key="tool.slug">
        <!-- 已上线 -->
        <div
          v-if="tool.status === 'available'"
          class="group relative rounded-xl border bg-white dark:bg-slate-900/50 border-gray-200 dark:border-slate-700 hover:border-accent/50 dark:hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5 cursor-pointer transition-all duration-200"
        >
          <a :href="`${BASE}tools/${tool.slug}/`" class="block p-5">
            <div class="flex items-start justify-between mb-3">
              <span class="text-3xl">{{ tool.icon }}</span>
              <span :class="['px-2 py-0.5 text-xs font-medium rounded-full border', categoryColors[tool.category] || '']">
                {{ tool.categoryLabel }}
              </span>
            </div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1.5 group-hover:text-accent-dark dark:group-hover:text-accent transition-colors">
              {{ tool.name }}
            </h3>
            <p class="text-sm text-gray-500 dark:text-slate-400 leading-relaxed mb-3">{{ tool.desc }}</p>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="tag in tool.tags" :key="tag" class="px-2 py-0.5 text-xs rounded bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400">
                {{ tag }}
              </span>
            </div>
            <div class="mt-4 flex items-center gap-1 text-xs text-accent-dark dark:text-accent opacity-0 group-hover:opacity-100 transition-opacity">
              <span>立即使用</span>
              <svg class="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
              </svg>
            </div>
          </a>
        </div>

        <!-- 开发中 -->
        <div
          v-else
          class="rounded-xl border bg-gray-50 dark:bg-slate-900/30 border-gray-100 dark:border-slate-800 opacity-70"
        >
          <div class="p-5">
            <div class="flex items-start justify-between mb-3">
              <span class="text-3xl grayscale opacity-60">{{ tool.icon }}</span>
              <span class="px-2 py-0.5 text-xs font-medium rounded-full border bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-700">开发中</span>
            </div>
            <h3 class="text-base font-semibold text-gray-500 dark:text-slate-500 mb-1.5">{{ tool.name }}</h3>
            <p class="text-sm text-gray-400 dark:text-slate-600 leading-relaxed mb-3">{{ tool.desc }}</p>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="tag in tool.tags" :key="tag" class="px-2 py-0.5 text-xs rounded bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-600">{{ tag }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 无搜索结果 -->
      <div v-if="filtered.length === 0" class="col-span-full py-16 text-center text-gray-400 dark:text-slate-600">
        <div class="text-4xl mb-3">🔍</div>
        <p class="text-sm">未找到匹配的工具</p>
        <button @click="searchQuery = ''; activeCategory = 'all'" class="mt-3 text-xs text-accent-dark dark:text-accent underline underline-offset-2">清除筛选</button>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-1.5 pt-2">
      <!-- 上一页 -->
      <button
        @click="currentPage > 1 && currentPage--"
        :disabled="currentPage === 1"
        :class="['w-8 h-8 rounded-lg border flex items-center justify-center transition-all text-sm', currentPage === 1 ? 'border-gray-100 dark:border-slate-800 text-gray-300 dark:text-slate-700 cursor-not-allowed' : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>

      <!-- 页码 -->
      <template v-for="(page, i) in pageNumbers" :key="i">
        <span v-if="page === '...'" class="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-slate-600 text-sm">···</span>
        <button v-else @click="goTo(page)"
          :class="['w-8 h-8 rounded-lg border text-sm font-medium transition-all', page === currentPage ? 'bg-accent text-white border-accent' : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']"
        >{{ page }}</button>
      </template>

      <!-- 下一页 -->
      <button
        @click="currentPage < totalPages && currentPage++"
        :disabled="currentPage === totalPages"
        :class="['w-8 h-8 rounded-lg border flex items-center justify-center transition-all text-sm', currentPage === totalPages ? 'border-gray-100 dark:border-slate-800 text-gray-300 dark:text-slate-700 cursor-not-allowed' : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>

      <span class="ml-2 text-xs text-gray-400 dark:text-slate-600">第 {{ currentPage }} / {{ totalPages }} 页</span>
    </div>
  </div>
</template>
