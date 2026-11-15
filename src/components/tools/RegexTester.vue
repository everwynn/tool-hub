<script setup lang="ts">
// ============================================================
// RegexTester — 正则表达式测试器
// ============================================================
// 功能：
// 1. 输入正则 + 标志（g/i/m/s）→ 实时测试
// 2. 高亮显示所有匹配项（颜色区分）
// 3. 显示捕获分组详情
// 4. 常用正则预设
// 5. 错误提示（非法正则实时提示）
// ============================================================

import { ref, computed } from 'vue'

const pattern = ref('')
const flags = ref({ g: true, i: false, m: false, s: false })
const testInput = ref('')

// 预设正则
const presets = [
  { label: '邮箱',         pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', flags: 'g' },
  { label: '手机号（中国）', pattern: '1[3-9]\\d{9}',                                  flags: 'g' },
  { label: 'URL',          pattern: 'https?://[\\w\\-.]+(:\\d+)?(/[\\w\\-./&?=%]*)?',   flags: 'g' },
  { label: 'IP 地址',      pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',                flags: 'g' },
  { label: 'HTML 标签',    pattern: '<[^>]+>',                                          flags: 'gi' },
  { label: '中文字符',     pattern: '[\\u4e00-\\u9fa5]+',                               flags: 'g' },
  { label: '数字',         pattern: '\\d+',                                             flags: 'g' },
  { label: '16进制颜色',   pattern: '#[0-9a-fA-F]{3,6}',                               flags: 'gi' },
  { label: 'JWT Token',    pattern: 'ey[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+', flags: 'g' },
  { label: '版本号',       pattern: '\\d+\\.\\d+\\.\\d+',                              flags: 'g' },
]

const applyPreset = (p: typeof presets[0]) => {
  pattern.value = p.pattern
  const f = p.flags
  flags.value = { g: f.includes('g'), i: f.includes('i'), m: f.includes('m'), s: f.includes('s') }
  // 示例文本
  const examples: Record<string, string> = {
    '邮箱': 'admin@example.com 和 user.name+tag@sub.domain.org 是两个有效邮箱地址',
    '手机号（中国）': '联系我们：13800138000 或 15912345678，工作日 9:00-18:00',
    'URL': '访问 https://example.com:8080/api/v1?key=value 或 http://localhost',
    'IP 地址': '服务器地址：192.168.1.1，DNS：8.8.8.8 和 114.114.114.114',
    'HTML 标签': '<div class="container"><p>Hello <strong>World</strong></p></div>',
    '中文字符': 'Hello 你好 World 世界 2024年 Nginx配置',
    '数字': 'Port 8080, Version 1.2.3, PID 12345, Code 200',
    '16进制颜色': 'background: #fff; color: #1a2b3c; border: 1px solid #F0F;',
    'JWT Token': 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.abc123',
    '版本号': 'node v20.11.0, npm 10.2.4, nginx 1.24.0, react 18.3.1',
  }
  if (examples[p.label]) testInput.value = examples[p.label]
}

const flagStr = computed(() => {
  return Object.entries(flags.value).filter(([, v]) => v).map(([k]) => k).join('')
})

// 正则验证
const regexError = computed(() => {
  if (!pattern.value) return null
  try {
    new RegExp(pattern.value, flagStr.value)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
})

// 高亮颜色池
const highlightColors = [
  'bg-yellow-200 dark:bg-yellow-900/60 text-yellow-900 dark:text-yellow-200',
  'bg-green-200 dark:bg-green-900/60 text-green-900 dark:text-green-200',
  'bg-blue-200 dark:bg-blue-900/60 text-blue-900 dark:text-blue-200',
  'bg-pink-200 dark:bg-pink-900/60 text-pink-900 dark:text-pink-200',
  'bg-orange-200 dark:bg-orange-900/60 text-orange-900 dark:text-orange-200',
]

interface MatchItem {
  index: number
  end: number
  value: string
  groups: string[]
  colorIdx: number
}

const matchResult = computed(() => {
  if (!pattern.value || !testInput.value || regexError.value) {
    return { matches: [] as MatchItem[], segments: [] as Array<{ text: string; match?: MatchItem }> }
  }

  try {
    const f = flagStr.value.includes('g') ? flagStr.value : flagStr.value + 'g'
    const regex = new RegExp(pattern.value, f)
    const text = testInput.value
    const matches: MatchItem[] = []
    let m: RegExpExecArray | null

    while ((m = regex.exec(text)) !== null) {
      matches.push({
        index: m.index,
        end: m.index + m[0].length,
        value: m[0],
        groups: m.slice(1),
        colorIdx: matches.length % highlightColors.length,
      })
      // 防止零长度匹配死循环
      if (m[0].length === 0) { regex.lastIndex++; break }
      if (matches.length >= 100) break
    }

    // 分段（用于高亮渲染）
    const segments: Array<{ text: string; match?: MatchItem }> = []
    let last = 0
    for (const match of matches) {
      if (match.index > last) {
        segments.push({ text: text.slice(last, match.index) })
      }
      segments.push({ text: match.value, match })
      last = match.end
    }
    if (last < text.length) {
      segments.push({ text: text.slice(last) })
    }

    return { matches, segments }
  } catch {
    return { matches: [] as MatchItem[], segments: [] as Array<{ text: string; match?: MatchItem }> }
  }
})

const hasGroups = computed(() =>
  matchResult.value.matches.some(m => m.groups.length > 0)
)
</script>

<template>
  <div class="space-y-6">
    <!-- 正则输入 + 标志 -->
    <div class="flex flex-col sm:flex-row gap-3">
      <div class="flex-1">
        <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">正则表达式</label>
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-600 font-mono text-sm select-none">/</span>
          <input
            v-model="pattern"
            type="text"
            placeholder="输入正则，如 \\d+"
            :class="[
              'w-full pl-7 pr-7 py-2.5 text-sm font-mono rounded-xl border focus:outline-none focus:ring-2 transition-all',
              regexError
                ? 'border-red-300 dark:border-red-700 focus:ring-red-300/30 bg-red-50 dark:bg-red-900/10'
                : 'border-gray-200 dark:border-slate-700 focus:ring-accent/30 focus:border-accent/50 bg-gray-50 dark:bg-slate-900/50'
            ]"
            class="text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600"
            spellcheck="false"
          />
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-600 font-mono text-sm select-none">/</span>
        </div>
        <div v-if="regexError" class="mt-1.5 text-xs text-red-500 dark:text-red-400">{{ regexError }}</div>
      </div>

      <!-- 标志 -->
      <div>
        <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">标志（flags）</label>
        <div class="flex gap-2">
          <button
            v-for="(val, flag) in flags"
            :key="flag"
            @click="flags[flag as keyof typeof flags] = !flags[flag as keyof typeof flags]"
            :class="[
              'w-10 h-10 font-mono text-sm rounded-lg border transition-all',
              flags[flag as keyof typeof flags]
                ? 'bg-accent text-white border-accent'
                : 'bg-white dark:bg-slate-900/50 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/40'
            ]"
            :title="{ g: '全局匹配', i: '忽略大小写', m: '多行模式', s: '. 匹配换行' }[flag]"
          >{{ flag }}</button>
        </div>
      </div>
    </div>

    <!-- 统计 -->
    <div v-if="pattern && !regexError" class="flex items-center gap-4 text-sm">
      <span class="font-medium text-gray-700 dark:text-slate-200">
        匹配到 <strong class="text-accent-dark dark:text-accent">{{ matchResult.matches.length }}</strong> 处
      </span>
      <code class="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 font-mono">
        /{{ pattern }}/{{ flagStr }}
      </code>
    </div>

    <!-- 预设 -->
    <div>
      <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-2">常用预设</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="p in presets"
          :key="p.label"
          @click="applyPreset(p)"
          class="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent bg-white dark:bg-slate-900/40 transition-all"
        >{{ p.label }}</button>
      </div>
    </div>

    <!-- 测试文本输入 -->
    <div>
      <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">测试文本</label>
      <textarea
        v-model="testInput"
        rows="5"
        placeholder="在此输入或粘贴要测试的文本..."
        class="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none transition-all leading-relaxed"
        spellcheck="false"
      ></textarea>
    </div>

    <!-- 高亮匹配结果 -->
    <div v-if="testInput && pattern && !regexError">
      <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-2">匹配结果高亮</label>
      <div class="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 text-sm leading-loose whitespace-pre-wrap break-all font-mono">
        <template v-for="(seg, i) in matchResult.segments" :key="i">
          <span
            v-if="seg.match"
            :class="['rounded px-0.5 font-semibold', highlightColors[seg.match.colorIdx]]"
          >{{ seg.text }}</span>
          <span v-else class="text-gray-700 dark:text-slate-300">{{ seg.text }}</span>
        </template>
        <span v-if="matchResult.segments.length === 0" class="text-gray-400 dark:text-slate-600">无匹配</span>
      </div>
    </div>

    <!-- 匹配详情 -->
    <div v-if="matchResult.matches.length > 0">
      <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-2">匹配详情</label>
      <div class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 dark:bg-slate-800/60">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-500 w-12">#</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-500">匹配值</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-500">位置</th>
              <th v-if="hasGroups" class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-slate-500">捕获组</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(m, idx) in matchResult.matches"
              :key="idx"
              class="border-t border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
            >
              <td class="px-4 py-2 text-xs text-gray-400 dark:text-slate-600">{{ idx + 1 }}</td>
              <td class="px-4 py-2">
                <span :class="['px-1.5 py-0.5 rounded text-xs font-mono font-semibold', highlightColors[m.colorIdx]]">
                  {{ m.value }}
                </span>
              </td>
              <td class="px-4 py-2 text-xs font-mono text-gray-500 dark:text-slate-500">{{ m.index }}–{{ m.end }}</td>
              <td v-if="hasGroups" class="px-4 py-2 text-xs font-mono text-gray-600 dark:text-slate-400">
                {{ m.groups.filter(g => g !== undefined).join(', ') || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="matchResult.matches.length >= 100" class="px-4 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-100 dark:border-amber-900">
          ⚠ 仅显示前 100 个匹配结果
        </div>
      </div>
    </div>
  </div>
</template>
