<script setup lang="ts">
// ============================================================
// JsonPath — JSON Path 查询工具（手写简化版 JSONPath 解析器）
// ============================================================

import { ref, computed } from 'vue'

const jsonInput = ref('')
const pathInput = ref('$.')
const errorMsg = ref('')
const copied = ref(false)

// 简化版 JSONPath 查询
function queryByPath(obj: unknown, path: string): unknown[] {
  // 清理路径
  let p = path.trim()
  if (p.startsWith('$')) p = p.slice(1)
  if (p.startsWith('.')) p = p.slice(1)

  const results: unknown[] = []

  function traverse(current: unknown, segments: string[]) {
    if (segments.length === 0) {
      results.push(current)
      return
    }
    if (current === null || current === undefined) return

    const seg = segments[0]
    const rest = segments.slice(1)

    // 递归下降 ..
    if (seg === '') {
      // 收集所有子节点
      const collect = (node: unknown) => {
        traverse(node, rest)
        if (typeof node === 'object' && node !== null) {
          if (Array.isArray(node)) {
            node.forEach(item => collect(item))
          } else {
            Object.values(node as Record<string, unknown>).forEach(v => collect(v))
          }
        }
      }
      collect(current)
      return
    }

    // 通配符 *
    if (seg === '*') {
      if (Array.isArray(current)) {
        current.forEach(item => traverse(item, rest))
      } else if (typeof current === 'object') {
        Object.values(current as Record<string, unknown>).forEach(v => traverse(v, rest))
      }
      return
    }

    // 数组索引 [n] 或 [start:end]
    const arrayMatch = seg.match(/^\[(.+)\]$/)
    if (arrayMatch) {
      const expr = arrayMatch[1]
      if (!Array.isArray(current)) return
      // slice [1:3]
      if (expr.includes(':')) {
        const [s, e] = expr.split(':').map(x => x.trim() ? parseInt(x) : undefined)
        const start = s ?? 0
        const end = e ?? current.length
        for (let i = start; i < end && i < current.length; i++) {
          if (i >= 0) traverse(current[i], rest)
        }
      } else {
        // filter [?(@.field)] - 简化
        if (expr.startsWith('?')) {
          const filter = expr.slice(1).replace(/^\(@\./, '').replace(/\)$/, '')
          current.forEach((item: unknown) => {
            if (typeof item === 'object' && item !== null) {
              const [field, ...opParts] = filter.split(/=|==|>|<|!=/)
              const field2 = field.trim()
              const val = (item as Record<string, unknown>)[field2]
              if (val !== undefined) traverse(item, rest)
            }
          })
        } else {
          const idx = parseInt(expr)
          if (!isNaN(idx) && idx >= 0 && idx < current.length) {
            traverse(current[idx], rest)
          }
        }
      }
      return
    }

    // 普通属性
    if (typeof current === 'object') {
      if (Array.isArray(current)) {
        // 对数组的属性访问，等价于对每个元素访问
        current.forEach(item => traverse(item, segments))
      } else {
        const val = (current as Record<string, unknown>)[seg]
        if (val !== undefined) {
          traverse(val, rest)
        }
      }
      return
    }
  }

  // 解析路径为 segments
  // 支持: .property, [index], [start:end], *, ..
  const segments: string[] = []
  let i = 0
  while (i < p.length) {
    if (p[i] === '.') {
      if (p[i + 1] === '.') {
        // 递归下降
        segments.push('')
        i += 2
      } else {
        i++
      }
    } else if (p[i] === '[') {
      const end = p.indexOf(']', i)
      if (end === -1) break
      segments.push(`[${p.slice(i + 1, end)}]`)
      i = end + 1
    } else {
      // 属性名
      let j = i
      while (j < p.length && p[j] !== '.' && p[j] !== '[') j++
      segments.push(p.slice(i, j))
      i = j
    }
  }

  traverse(obj, segments)
  return results
}

const parsedJson = computed(() => {
  if (!jsonInput.value.trim()) return null
  try {
    const obj = JSON.parse(jsonInput.value)
    errorMsg.value = ''
    return obj
  } catch (e) {
    errorMsg.value = `JSON 解析失败：${e instanceof Error ? e.message : String(e)}`
    return null
  }
})

const queryResults = computed(() => {
  if (!parsedJson.value || !pathInput.value.trim()) return []
  errorMsg.value = ''
  try {
    return queryByPath(parsedJson.value, pathInput.value)
  } catch (e) {
    errorMsg.value = `查询失败：${e instanceof Error ? e.message : String(e)}`
    return []
  }
})

const resultText = computed(() => {
  if (!queryResults.value.length) return ''
  if (queryResults.value.length === 1) {
    const v = queryResults.value[0]
    return typeof v === 'string' ? v : JSON.stringify(v, null, 2)
  }
  return JSON.stringify(queryResults.value, null, 2)
})

const copyResult = async () => {
  if (!resultText.value) return
  await navigator.clipboard.writeText(resultText.value)
  copied.value = true; setTimeout(() => { copied.value = false }, 2000)
}

// 示例
const examples = [
  { label: '基本路径', path: '$.store.book[0].title', json: '{"store":{"book":[{"title":"Sayings of the Century","price":8.95},{"title":"Sword of Honour","price":12.99}],"bicycle":{"color":"red","price":19.95}}}' },
  { label: '通配符 *', path: '$.store.book[*].price', json: '{"store":{"book":[{"title":"A","price":8.95},{"title":"B","price":12.99}],"bicycle":{"color":"red","price":19.95}}}' },
  { label: '递归下降 ..', path: '$..price', json: '{"store":{"book":[{"price":8.95},{"price":12.99}],"bicycle":{"price":19.95}}}' },
  { label: '数组切片', path: '$.store.book[0:2]', json: '{"store":{"book":[{"title":"A"},{"title":"B"},{"title":"C"}]}}' },
]

const loadExample = (ex: typeof examples[0]) => {
  jsonInput.value = JSON.stringify(JSON.parse(ex.json), null, 2)
  pathInput.value = ex.path
}
</script>

<template>
  <div class="space-y-5">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- JSON 输入 -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-medium text-gray-600 dark:text-slate-400">JSON 数据</span>
          <button @click="jsonInput = ''" v-if="jsonInput" class="text-xs text-gray-400 hover:text-red-500 transition-colors">清空</button>
        </div>
        <textarea v-model="jsonInput" rows="12" placeholder='{"name":"test","items":[{"id":1},{"id":2}]}' 
          class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none"
          spellcheck="false"></textarea>
      </div>

      <!-- 结果输出 -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-medium text-gray-600 dark:text-slate-400">查询结果（{{ queryResults.length }} 条）</span>
          <button @click="copyResult" :disabled="!resultText" :class="['text-xs px-2.5 py-1 rounded-lg border transition-all disabled:opacity-40', copied ? 'border-green-400 text-green-600 dark:text-green-400' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-accent/50']">
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <pre class="h-[300px] overflow-auto px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-700 dark:text-slate-300 whitespace-pre-wrap break-all leading-relaxed">{{ resultText || (errorMsg ? '' : '结果将显示在这里') }}</pre>
      </div>
    </div>

    <!-- Path 输入 -->
    <div>
      <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">JSONPath 表达式</label>
      <div class="flex gap-2">
        <input v-model="pathInput" type="text" spellcheck="false" placeholder="$.store.book[0].title"
          class="flex-1 px-4 py-2.5 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
        />
      </div>
    </div>

    <!-- 错误 -->
    <div v-if="errorMsg" class="text-xs text-red-500 dark:text-red-400 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
      {{ errorMsg }}
    </div>

    <!-- 示例 -->
    <div class="space-y-2">
      <h3 class="text-xs font-semibold text-gray-500 dark:text-slate-500">快速示例</h3>
      <div class="flex flex-wrap gap-2">
        <button v-for="ex in examples" :key="ex.label" @click="loadExample(ex)"
          class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent-dark dark:hover:text-accent transition-all font-mono"
        >{{ ex.label }}</button>
      </div>
    </div>

    <!-- 语法速查 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div class="px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
        <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">JSONPath 语法速查</span>
      </div>
      <div class="p-4 space-y-2 text-xs font-mono">
        <div class="flex gap-3"><span class="text-accent-dark dark:text-accent w-20 flex-shrink-0">$</span><span class="text-gray-500 dark:text-slate-400">根对象</span></div>
        <div class="flex gap-3"><span class="text-accent-dark dark:text-accent w-20 flex-shrink-0">.property</span><span class="text-gray-500 dark:text-slate-400">属性访问</span></div>
        <div class="flex gap-3"><span class="text-accent-dark dark:text-accent w-20 flex-shrink-0">[n]</span><span class="text-gray-500 dark:text-slate-400">数组索引（从 0 开始）</span></div>
        <div class="flex gap-3"><span class="text-accent-dark dark:text-accent w-20 flex-shrink-0">[s:e]</span><span class="text-gray-500 dark:text-slate-400">数组切片</span></div>
        <div class="flex gap-3"><span class="text-accent-dark dark:text-accent w-20 flex-shrink-0">*</span><span class="text-gray-500 dark:text-slate-400">通配符（所有元素）</span></div>
        <div class="flex gap-3"><span class="text-accent-dark dark:text-accent w-20 flex-shrink-0">..</span><span class="text-gray-500 dark:text-slate-400">递归下降（所有层级）</span></div>
      </div>
    </div>
  </div>
</template>
