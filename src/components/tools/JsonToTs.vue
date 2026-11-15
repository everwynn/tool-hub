<script setup lang="ts">
// ============================================================
// JsonToTs — JSON 转 TypeScript 类型生成器
// 本地解析 JSON，推断嵌套对象/数组/联合类型，生成 interface 或 type
// ============================================================

import { ref, computed } from 'vue'

interface TsField {
  key: string
  optional: boolean
  nodes: TsNode[]
}

type TsNode =
  | { kind: 'primitive'; name: string }
  | { kind: 'array'; element: TsNode }
  | { kind: 'object'; name: string; fields: TsField[] }
  | { kind: 'union'; options: TsNode[] }

interface Def {
  name: string
  fields: TsField[]
}

const input = ref('')
const rootName = ref('Root')
const declKind = ref<'interface' | 'type'>('interface')
const useExport = ref(true)
const copied = ref(false)

const SAMPLE = `{
  "id": 1,
  "name": "Alice",
  "active": true,
  "tags": ["admin", "dev"],
  "profile": {
    "email": "alice@example.com",
    "age": 30,
    "address": { "city": "Shanghai", "zip": "200000" }
  },
  "orders": [
    { "orderId": "A-1", "amount": 99.5, "paid": true },
    { "orderId": "A-2", "amount": 15, "coupon": "SAVE10", "paid": false }
  ]
}`

// ======================== 命名 ========================

let nameCount: Map<string, number> = new Map()

function pascal(s: string): string {
  let cleaned = s.replace(/[^0-9a-zA-Z]+(.)?/g, (_m: string, c?: string) => (c ? c.toUpperCase() : ''))
  if (!cleaned) cleaned = 'Item'
  cleaned = cleaned[0].toUpperCase() + cleaned.slice(1)
  return /^[0-9]/.test(cleaned) ? 'N' + cleaned : cleaned
}

function uniqueName(base: string): string {
  const n = nameCount.get(base) || 0
  nameCount.set(base, n + 1)
  return n === 0 ? base : `${base}${n + 1}`
}

// ======================== 推断 ========================

function nodeOf(value: unknown, nameHint: string): TsNode {
  if (value === null) return { kind: 'primitive', name: 'null' }
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'array', element: { kind: 'primitive', name: 'unknown' } }
    return { kind: 'array', element: mergeNodes(value.map((v) => nodeOf(v, nameHint))) }
  }
  if (typeof value === 'object') {
    const name = uniqueName(pascal(nameHint))
    const fields: TsField[] = Object.entries(value as Record<string, unknown>).map(([k, v]) => ({
      key: k,
      optional: false,
      nodes: [nodeOf(v, k)],
    }))
    return { kind: 'object', name, fields }
  }
  return { kind: 'primitive', name: typeof value }
}

/** 合并多个节点（数组元素 / 同名字段多类型） */
function mergeNodes(nodes: TsNode[]): TsNode {
  if (nodes.length === 1) return nodes[0]

  // 全部原始类型 → 去重联合
  if (nodes.every((n) => n.kind === 'primitive')) {
    const names: string[] = []
    for (const n of nodes) {
      for (const part of (n as { kind: 'primitive'; name: string }).name.split(' | ')) {
        if (!names.includes(part)) names.push(part)
      }
    }
    if (names.includes('unknown') || names.length <= 1) {
      return { kind: 'primitive', name: names.includes('unknown') ? 'unknown' : names[0] }
    }
    return { kind: 'primitive', name: names.join(' | ') }
  }

  // 全部数组 → 合并元素
  if (nodes.every((n) => n.kind === 'array')) {
    return {
      kind: 'array',
      element: mergeNodes(nodes.map((n) => (n as { kind: 'array'; element: TsNode }).element)),
    }
  }

  // 全部对象 → 合并字段并标记可选
  if (nodes.every((n) => n.kind === 'object')) {
    const objs = nodes as { kind: 'object'; name: string; fields: TsField[] }[]
    const merged: TsField[] = []
    for (const o of objs) {
      for (const f of o.fields) {
        const exist = merged.find((m) => m.key === f.key)
        if (exist) exist.nodes.push(...f.nodes)
        else merged.push({ key: f.key, optional: false, nodes: [...f.nodes] })
      }
    }
    for (const f of merged) {
      if (objs.some((o) => !o.fields.find((x) => x.key === f.key))) f.optional = true
    }
    return { kind: 'object', name: objs[0].name, fields: merged }
  }

  // 混合类型（如数组里既有对象又有字符串）→ union
  return { kind: 'union', options: nodes }
}

// ======================== 渲染 ========================

function formatKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${key.replace(/'/g, "\\'")}'`
}

/** 渲染类型表达式；对象会按序注册到 defs 并返回其名称 */
function renderInline(node: TsNode, defs: Map<string, Def>): string {
  if (node.kind === 'primitive') return node.name
  if (node.kind === 'array') {
    const inner = renderInline(node.element, defs)
    const needParen = node.element.kind === 'union'
    return needParen ? `(${inner})[]` : `${inner}[]`
  }
  if (node.kind === 'union') {
    const parts = [...new Set(node.options.map((o) => renderInline(o, defs)))]
    return parts.join(' | ')
  }
  if (!defs.has(node.name)) {
    defs.set(node.name, { name: node.name, fields: node.fields })
    for (const f of node.fields) renderInline(mergeNodes(f.nodes), defs)
  }
  return node.name
}

function renderDefs(defs: Map<string, Def>): string {
  const blocks: string[] = []
  const exp = useExport.value ? 'export ' : ''
  for (const def of defs.values()) {
    const lines = def.fields.map((f) => {
      const t = renderInline(mergeNodes(f.nodes), defs)
      return `  ${formatKey(f.key)}${f.optional ? '?' : ''}: ${t};`
    })
    const body = lines.length ? `{\n${lines.join('\n')}\n}` : '{}'
    if (declKind.value === 'interface') {
      blocks.push(`${exp}interface ${def.name} ${body}`)
    } else {
      blocks.push(`${exp}type ${def.name} = ${body};`)
    }
  }
  return blocks.join('\n\n')
}

const result = computed(() => {
  if (!input.value.trim()) return { code: '', error: '' }
  nameCount = new Map()
  let data: unknown
  try {
    data = JSON.parse(input.value)
  } catch (e) {
    return { code: '', error: e instanceof Error ? `JSON 解析失败：${e.message}` : 'JSON 解析失败' }
  }

  // 根为数组时，元素命名加 Item 后缀，避免与根别名重名
  const baseName = rootName.value.trim() || 'Root'
  const rootHint = Array.isArray(data) ? `${baseName}Item` : baseName
  const root = nodeOf(data, rootHint)
  const defs = new Map<string, Def>()
  const exp = useExport.value ? 'export ' : ''

  if (root.kind === 'object') {
    renderInline(root, defs)
    return { code: renderDefs(defs), error: '' }
  }

  const inner = renderInline(root, defs)
  const alias = `${exp}type ${pascal(baseName)} = ${inner};`
  const defsCode = renderDefs(defs)
  return { code: defsCode ? `${defsCode}\n\n${alias}` : alias, error: '' }
})

// ======================== 操作 ========================

const copy = async () => {
  if (!result.value.code) return
  await navigator.clipboard.writeText(result.value.code)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <div class="space-y-5">
    <!-- 选项栏 -->
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs text-gray-500 dark:text-slate-500">根类型名</span>
        <input
          v-model="rootName"
          type="text"
          spellcheck="false"
          class="w-32 px-3 py-1.5 text-sm font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
        />
      </label>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-gray-500 dark:text-slate-500">声明方式</span>
        <div class="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <button
            v-for="k in (['interface', 'type'] as const)"
            :key="k"
            @click="declKind = k"
            :class="['px-3 py-1.5 text-sm font-mono transition-colors', declKind === k
              ? 'bg-accent text-white'
              : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:text-accent']"
          >{{ k }}</button>
        </div>
      </div>

      <label class="flex items-center gap-2 pb-1.5 text-sm text-gray-600 dark:text-slate-400 select-none cursor-pointer">
        <input type="checkbox" v-model="useExport" class="accent-accent w-4 h-4" />
        export
      </label>

      <div class="flex gap-2 pb-1">
        <button @click="input = SAMPLE" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">加载示例</button>
        <button @click="input = ''" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">清空</button>
      </div>
    </div>

    <!-- 输入 / 输出 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">JSON 输入</span>
          <span class="text-xs text-gray-400 dark:text-slate-600">{{ input.length }} 字符</span>
        </div>
        <textarea
          v-model="input"
          spellcheck="false"
          placeholder='粘贴 JSON，例如：&#10;{&#10;  "id": 1,&#10;  "name": "Alice"&#10;}'
          class="w-full h-80 px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none leading-relaxed"
        ></textarea>
        <div v-if="result.error" class="mt-1.5 text-xs text-red-500 dark:text-red-400">{{ result.error }}</div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">TypeScript 类型</span>
          <button
            @click="copy"
            :disabled="!result.code"
            :class="['text-xs px-2.5 py-0.5 rounded border transition-all', result.code
              ? (copied ? 'border-green-400 text-green-600 dark:text-green-400' : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/40 hover:text-accent')
              : 'border-gray-100 dark:border-slate-800 text-gray-300 dark:text-slate-700 cursor-not-allowed']"
          >{{ copied ? '已复制' : '复制' }}</button>
        </div>
        <pre class="w-full h-80 px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 text-gray-800 dark:text-slate-200 overflow-auto leading-relaxed"><code>{{ result.code || '// 左侧输入 JSON 后自动生成类型声明' }}</code></pre>
      </div>
    </div>

    <!-- 说明 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
      <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-2">推断规则</h3>
      <ul class="text-xs text-gray-500 dark:text-slate-500 space-y-1 list-disc list-inside">
        <li>嵌套对象自动拆分为独立 interface，数组元素结构合并、缺失字段自动标记为可选（?）</li>
        <li>同名字段出现多种类型时生成联合类型；空数组推断为 unknown[]</li>
        <li>全部在浏览器本地完成，不上传任何数据</li>
      </ul>
    </div>
  </div>
</template>
