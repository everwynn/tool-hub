<script setup lang="ts">
// ============================================================
// CaseConverter — 命名风格转换器
// 自动分词（大小写边界 / 分隔符），实时输出 8 种常见命名风格
// ============================================================

import { ref, computed } from 'vue'

const input = ref('userProfileID')

const copiedKey = ref('')
let copyTimer: ReturnType<typeof setTimeout> | null = null

const SAMPLE = 'userProfileID'

// ------------------------ 分词 ------------------------

function splitWords(raw: string): string[] {
  let s = raw.trim()
  if (!s) return []
  // 分隔符统一为空格（下划线 / 连字符 / 点 / 空白）
  s = s.replace(/[_\-.\s]+/g, ' ')
  // 小写或数字 → 大写边界：fooBar → foo Bar
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  // 连续大写 + 大写小写：HTTPServer → HTTP Server
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  return s.split(/\s+/).filter(Boolean)
}

// ------------------------ 风格转换 ------------------------

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

interface StyleDef {
  key: string
  label: string
  sample: string
  build: (words: string[]) => string
}

const STYLES: StyleDef[] = [
  { key: 'camel', label: 'camelCase', sample: 'fooBarBaz', build: (w) => w.map((x, i) => (i === 0 ? x.toLowerCase() : cap(x))).join('') },
  { key: 'pascal', label: 'PascalCase', sample: 'FooBarBaz', build: (w) => w.map(cap).join('') },
  { key: 'snake', label: 'snake_case', sample: 'foo_bar_baz', build: (w) => w.map((x) => x.toLowerCase()).join('_') },
  { key: 'constant', label: 'CONSTANT_CASE', sample: 'FOO_BAR_BAZ', build: (w) => w.map((x) => x.toUpperCase()).join('_') },
  { key: 'kebab', label: 'kebab-case', sample: 'foo-bar-baz', build: (w) => w.map((x) => x.toLowerCase()).join('-') },
  { key: 'dot', label: 'dot.case', sample: 'foo.bar.baz', build: (w) => w.map((x) => x.toLowerCase()).join('.') },
  { key: 'title', label: 'Title Case', sample: 'Foo Bar Baz', build: (w) => w.map(cap).join(' ') },
  { key: 'space', label: '空格分隔', sample: 'foo bar baz', build: (w) => w.map((x) => x.toLowerCase()).join(' ') },
]

const words = computed(() => splitWords(input.value))

const results = computed(() =>
  STYLES.map((s) => ({ ...s, value: s.build(words.value) }))
)

// ------------------------ 输入风格识别 ------------------------

const detected = computed(() => {
  const s = input.value.trim()
  if (!s) return ''
  const hasUpper = /[A-Z]/.test(s)
  if (s.includes('_')) {
    if (/^[A-Z0-9_]+$/.test(s)) return 'CONSTANT_CASE'
    return 'snake_case'
  }
  if (s.includes('-')) return 'kebab-case'
  if (s.includes('.')) return 'dot.case'
  if (/\s/.test(s)) return '空格 / Title Case'
  if (/^[a-z][a-zA-Z0-9]*$/.test(s)) return hasUpper ? 'camelCase' : '全小写'
  if (/^[A-Z][a-zA-Z0-9]*$/.test(s)) return 'PascalCase'
  return '混合'
})

// ------------------------ 操作 ------------------------

const copy = async (key: string, value: string) => {
  if (!value) return
  await navigator.clipboard.writeText(value)
  copiedKey.value = key
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copiedKey.value = '' }, 2000)
}
</script>

<template>
  <div class="space-y-5">
    <!-- 输入 -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">输入</span>
          <span v-if="detected" class="px-2 py-0.5 text-xs rounded-full bg-accent/10 text-accent border border-accent/20">识别为 {{ detected }}</span>
        </div>
        <div class="flex gap-2">
          <button @click="input = SAMPLE" class="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">加载示例</button>
          <button @click="input = ''" class="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">清空</button>
        </div>
      </div>
      <input
        v-model="input"
        type="text"
        spellcheck="false"
        placeholder="粘贴任意命名的标识符，例如 userProfileID / user_profile_id / user-profile-id"
        class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
      />
      <div v-if="words.length" class="mt-1.5 text-xs text-gray-400 dark:text-slate-600">
        分词结果：<span class="font-mono">{{ words.join(' | ') }}</span>
      </div>
    </div>

    <!-- 结果 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div
        v-for="r in results"
        :key="r.key"
        class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-4 py-3"
      >
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">{{ r.label }}</span>
          <button
            @click="copy(r.key, r.value)"
            :disabled="!r.value"
            :class="['text-xs px-2 py-0.5 rounded border transition-all', r.value
              ? (copiedKey === r.key ? 'border-green-400 text-green-600 dark:text-green-400' : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/40 hover:text-accent')
              : 'border-gray-100 dark:border-slate-800 text-gray-300 dark:text-slate-700 cursor-not-allowed']"
          >{{ copiedKey === r.key ? '已复制' : '复制' }}</button>
        </div>
        <pre class="text-sm font-mono text-gray-800 dark:text-slate-200 overflow-x-auto whitespace-pre"><code>{{ r.value || r.sample }}</code></pre>
      </div>
    </div>

    <!-- 说明 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
      <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-2">分词规则</h3>
      <ul class="text-xs text-gray-500 dark:text-slate-500 space-y-1 list-disc list-inside">
        <li>按分隔符（_ - . 空格）与大小写边界自动分词，如 HTTPServer → HTTP | Server</li>
        <li>数字紧跟字母时保留整体，如 v2Update → v2 | Update</li>
        <li>输入多个词或整句时同样按词转换；全部在浏览器本地完成</li>
      </ul>
    </div>
  </div>
</template>
