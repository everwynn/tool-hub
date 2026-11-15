<script setup lang="ts">
// ============================================================
// CsvJsonConverter — CSV ↔ JSON 互转
// ============================================================

import { ref, computed } from 'vue'

type Direction = 'csv2json' | 'json2csv'
type Delimiter = ',' | ';' | '\t' | '|'

const direction = ref<Direction>('csv2json')
const delimiter = ref<Delimiter>(',')
const hasHeader = ref(true)
const inputText = ref('')
const copied = ref(false)

// CSV 解析（支持引号、换行、转义）
function parseCSV(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2 }
        else { inQuotes = false; i++ }
      } else { field += ch; i++ }
    } else {
      if (ch === '"') { inQuotes = true; i++ }
      else if (ch === delim) { row.push(field); field = ''; i++ }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++ }
      else if (ch === '\r') { i++; if (text[i] === '\n') i++ }
      else { field += ch; i++ }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length > 0 && !(r.length === 1 && r[0] === ''))
}

function csvToJson(csv: string, delim: string, header: boolean): unknown[] {
  const rows = parseCSV(csv, delim)
  if (!rows.length) return []
  if (!header) {
    return rows.map(row => {
      const obj: Record<string, unknown> = {}
      row.forEach((cell, i) => { obj[`col${i + 1}`] = cell })
      return obj
    })
  }
  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map(row => {
    const obj: Record<string, unknown> = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
    return obj
  })
}

function jsonToCsv(json: unknown, delim: string): string {
  let arr: unknown[]
  if (typeof json === 'string') arr = JSON.parse(json)
  else arr = json as unknown[]

  if (!Array.isArray(arr)) {
    // 对象转 CSV
    arr = [arr]
  }

  if (!arr.length) return ''
  // 收集所有 key
  const keys = new Set<string>()
  arr.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item as Record<string, unknown>).forEach(k => keys.add(k))
    }
  })
  const headers = [...keys]
  if (!headers.length) return ''

  const escape = (val: unknown): string => {
    const s = String(val ?? '')
    if (s.includes(delim) || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const lines: string[] = []
  lines.push(headers.map(h => escape(h)).join(delim))
  arr.forEach(item => {
    const obj = item as Record<string, unknown>
    lines.push(headers.map(h => escape(obj?.[h] ?? '')).join(delim))
  })
  return lines.join('\n')
}

const output = computed(() => {
  if (!inputText.value.trim()) return ''
  try {
    if (direction.value === 'csv2json') {
      const result = csvToJson(inputText.value, delimiter.value, hasHeader.value)
      return JSON.stringify(result, null, 2)
    } else {
      return jsonToCsv(inputText.value, delimiter.value)
    }
  } catch (e) {
    return `转换失败：${e instanceof Error ? e.message : String(e)}`
  }
})

const stats = computed(() => {
  if (!output.value || output.value.startsWith('转换失败')) return null
  if (direction.value === 'csv2json') {
    try { return { label: `${JSON.parse(output.value).length} 条记录` } } catch { return null }
  }
  const lines = output.value.split('\n').length
  return { label: `${lines} 行（含表头）` }
})

const copy = async () => {
  if (!output.value) return
  await navigator.clipboard.writeText(output.value)
  copied.value = true; setTimeout(() => { copied.value = false }, 2000)
}

const swap = () => {
  if (output.value && !output.value.startsWith('转换失败')) {
    inputText.value = output.value
  }
  direction.value = direction.value === 'csv2json' ? 'json2csv' : 'csv2json'
}

const delimiterLabels: Record<Delimiter, string> = {
  ',': '逗号 (,)',
  ';': '分号 (;)',
  '\t': 'Tab',
  '|': '竖线 (|)',
}

const placeholderText = computed(() =>
  direction.value === 'csv2json'
    ? 'name,age,city\nAlice,30,Beijing'
    : '[\n  {"name":"Alice","age":30}\n]'
)

const loadExample = () => {
  if (direction.value === 'csv2json') {
    inputText.value = 'name,age,city,active\nAlice,30,"New York, NY",true\nBob,25,"San Francisco, CA",false\nCharlie,35,北京,true'
  } else {
    inputText.value = '[\n  {"name":"Alice","age":30,"city":"New York, NY","active":true},\n  {"name":"Bob","age":25,"city":"San Francisco, CA","active":false}\n]'
  }
}
</script>

<template>
  <div class="space-y-5">
    <!-- 方向 + 选项 -->
    <div class="flex flex-wrap gap-3 items-center">
      <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
        <button @click="direction = 'csv2json'" :class="['px-4 py-2 text-sm font-medium transition-all border-r border-gray-200 dark:border-slate-700', direction === 'csv2json' ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']">
          CSV → JSON
        </button>
        <button @click="direction = 'json2csv'" :class="['px-4 py-2 text-sm font-medium transition-all', direction === 'json2csv' ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']">
          JSON → CSV
        </button>
      </div>

      <template v-if="direction === 'csv2json'">
        <select v-model="delimiter" class="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30">
          <option v-for="d in ([',', ';', '\t', '|'] as Delimiter[])" :key="d" :value="d">{{ delimiterLabels[d] }}</option>
        </select>
        <label class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400 cursor-pointer select-none">
          <input type="checkbox" v-model="hasHeader" class="w-3.5 h-3.5 accent-accent" /> 首行是表头
        </label>
      </template>
      <template v-else>
        <select v-model="delimiter" class="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30">
          <option v-for="d in ([',', ';', '\t', '|'] as Delimiter[])" :key="d" :value="d">{{ delimiterLabels[d] }}</option>
        </select>
      </template>

      <div class="ml-auto flex gap-2">
        <button @click="loadExample" class="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">载入示例</button>
        <button @click="swap" class="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">⇄ 互换</button>
      </div>
    </div>

    <!-- 输入/输出 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-medium text-gray-600 dark:text-slate-400">
            {{ direction === 'csv2json' ? 'CSV 输入' : 'JSON 输入' }}
          </span>
          <button @click="inputText = ''" v-if="inputText" class="text-xs text-gray-400 hover:text-red-500 transition-colors">清空</button>
        </div>
        <textarea v-model="inputText" rows="12"
          :placeholder="placeholderText"
          class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none"
          spellcheck="false"></textarea>
      </div>

      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-medium text-gray-600 dark:text-slate-400">
            {{ direction === 'csv2json' ? 'JSON 输出' : 'CSV 输出' }}
            <span v-if="stats" class="ml-2 text-gray-400 dark:text-slate-600">{{ stats.label }}</span>
          </span>
          <button @click="copy" :disabled="!output" :class="['text-xs px-2.5 py-1 rounded-lg border transition-all disabled:opacity-40', copied ? 'border-green-400 text-green-600 dark:text-green-400' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-accent/50']">
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <pre class="h-[300px] overflow-auto px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-700 dark:text-slate-300 whitespace-pre-wrap break-all leading-relaxed">{{ output || '结果将显示在这里' }}</pre>
      </div>
    </div>
  </div>
</template>
