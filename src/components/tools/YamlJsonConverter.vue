<script setup lang="ts">
// ============================================================
// YamlJsonConverter — YAML ↔ JSON 互转（手写轻量 YAML 解析器）
// ============================================================

import { ref, computed } from 'vue'

type Direction = 'yaml2json' | 'json2yaml'

const input     = ref('')
const direction = ref<Direction>('yaml2json')
const indent    = ref(2)
const copied    = ref(false)

// ============================================================
// 轻量 YAML 解析器（支持日常 K8s / docker-compose 场景）
// ============================================================
function parseYaml(yaml: string): unknown {
  const lines = yaml.split('\n')
  let pos = 0

  function peek() { return lines[pos] }
  function isBlank(line: string) { return /^\s*$/.test(line) || /^\s*#/.test(line) }
  function indentOf(line: string) { return line.match(/^(\s*)/)?.[1].length ?? 0 }

  function parseValue(raw: string): unknown {
    raw = raw.trim()
    if (raw === '' || raw === 'null' || raw === '~') return null
    if (raw === 'true') return true
    if (raw === 'false') return false
    if (/^-?\d+$/.test(raw)) return parseInt(raw, 10)
    if (/^-?\d*\.\d+$/.test(raw)) return parseFloat(raw)
    // 引号字符串
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t')
    }
    return raw
  }

  function collectBlock(baseIndent: number): string[] {
    const result: string[] = []
    while (pos < lines.length) {
      const line = lines[pos]
      if (isBlank(line)) { pos++; continue }
      if (indentOf(line) <= baseIndent) break
      result.push(line)
      pos++
    }
    return result
  }

  function parseLines(lineList: string[], baseIndent: number): unknown {
    // 先过滤空行
    const valid = lineList.filter(l => !isBlank(l))
    if (!valid.length) return null

    const firstIndent = indentOf(valid[0])
    // 判断是数组还是对象
    if (valid[0].trimStart().startsWith('- ') || valid[0].trimStart() === '-') {
      // 数组
      const arr: unknown[] = []
      let i = 0
      while (i < valid.length) {
        const line = valid[i]
        if (indentOf(line) !== firstIndent) { i++; continue }
        const rest = line.trimStart().replace(/^-\s*/, '')
        if (rest === '' || rest === '|' || rest === '>') {
          // 多行值
          const subLines: string[] = []
          i++
          while (i < valid.length && indentOf(valid[i]) > firstIndent) { subLines.push(valid[i]); i++ }
          arr.push(parseLines(subLines, firstIndent))
        } else {
          arr.push(parseValue(rest))
          i++
        }
      }
      return arr
    } else {
      // 对象
      const obj: Record<string, unknown> = {}
      let i = 0
      while (i < valid.length) {
        const line = valid[i]
        if (indentOf(line) !== firstIndent) { i++; continue }
        const trimmed = line.trimStart()
        const colonIdx = trimmed.indexOf(': ')
        const isKeyOnly = trimmed.endsWith(':')
        if (colonIdx === -1 && !isKeyOnly) { i++; continue }

        const key = isKeyOnly ? trimmed.slice(0, -1) : trimmed.slice(0, colonIdx)
        const valStr = isKeyOnly ? '' : trimmed.slice(colonIdx + 2)

        if (valStr === '' || valStr.trimStart().startsWith('#')) {
          // 值在下面几行
          i++
          const subLines: string[] = []
          while (i < valid.length && indentOf(valid[i]) > firstIndent) { subLines.push(valid[i]); i++ }
          obj[key] = subLines.length ? parseLines(subLines, firstIndent) : null
        } else {
          obj[key] = parseValue(valStr)
          i++
        }
      }
      return obj
    }
  }

  // 去掉文档头 ---
  const cleaned = lines.filter(l => l.trim() !== '---' && l.trim() !== '...')
  return parseLines(cleaned, -1)
}

// ============================================================
// 轻量 JSON→YAML 序列化
// ============================================================
function toYaml(val: unknown, indentLevel = 0, inlineKey = false): string {
  const pad = '  '.repeat(indentLevel)
  const childPad = '  '.repeat(indentLevel + 1)

  if (val === null || val === undefined) return 'null'
  if (typeof val === 'boolean') return String(val)
  if (typeof val === 'number') return String(val)
  if (typeof val === 'string') {
    // 需要引号的情况
    if (val === '' || /[:#\[\]{}&*!,|>'"%@`]/.test(val) || /^\s|\s$/.test(val) || val === 'true' || val === 'false' || val === 'null' || /^-?\d/.test(val)) {
      return `"${val.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
    }
    return val
  }
  if (Array.isArray(val)) {
    if (!val.length) return '[]'
    return '\n' + val.map(item => {
      const rendered = toYaml(item, indentLevel + 1, false)
      // 如果 rendered 以换行开头，说明是对象/数组，需要嵌套
      if (rendered.startsWith('\n')) {
        return `${pad}- ${rendered.trimStart()}`
      }
      return `${pad}- ${rendered}`
    }).join('\n')
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>)
    if (!entries.length) return '{}'
    return '\n' + entries.map(([k, v]) => {
      const rendered = toYaml(v, indentLevel + 1, true)
      if (rendered.startsWith('\n')) {
        return `${pad}${k}:${rendered}`
      }
      return `${pad}${k}: ${rendered}`
    }).join('\n')
  }
  return String(val)
}

function jsonToYaml(json: string): string {
  const obj = JSON.parse(json)
  const raw = toYaml(obj, 0)
  return (raw.startsWith('\n') ? raw.slice(1) : raw).trimEnd()
}

// ============================================================
// 计算输出
// ============================================================
interface ConvertResult { ok: boolean; output: string; error?: string }

const result = computed<ConvertResult>(() => {
  const raw = input.value.trim()
  if (!raw) return { ok: true, output: '' }
  try {
    if (direction.value === 'yaml2json') {
      const parsed = parseYaml(raw)
      return { ok: true, output: JSON.stringify(parsed, null, indent.value) }
    } else {
      return { ok: true, output: jsonToYaml(raw) }
    }
  } catch (e) {
    return { ok: false, output: '', error: `解析失败：${e instanceof Error ? e.message : String(e)}` }
  }
})

const copy = async () => {
  if (!result.value.output) return
  await navigator.clipboard.writeText(result.value.output)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const swap = () => {
  if (result.value.ok && result.value.output) {
    input.value = result.value.output
    direction.value = direction.value === 'yaml2json' ? 'json2yaml' : 'yaml2json'
  }
}

const yamlExample = `# Docker Compose 示例
version: "3.8"
services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    environment:
      - NODE_ENV=production
    volumes:
      - ./html:/usr/share/nginx/html
  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: secret
      MYSQL_DATABASE: myapp
    ports:
      - "3306:3306"`

const jsonExample = `{
  "version": "3.8",
  "services": {
    "web": {
      "image": "nginx:alpine",
      "ports": ["80:80"],
      "environment": ["NODE_ENV=production"]
    },
    "db": {
      "image": "mysql:8.0",
      "environment": {
        "MYSQL_ROOT_PASSWORD": "secret",
        "MYSQL_DATABASE": "myapp"
      }
    }
  }
}`

const loadExample = () => {
  input.value = direction.value === 'yaml2json' ? yamlExample : jsonExample
}

const inputLabel = computed(() => direction.value === 'yaml2json' ? 'YAML 输入' : 'JSON 输入')
const outputLabel = computed(() => direction.value === 'yaml2json' ? 'JSON 输出' : 'YAML 输出')
</script>

<template>
  <div class="space-y-5">
    <!-- 方向选择 + 设置 -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
        <button @click="direction = 'yaml2json'" :class="['px-4 py-2 text-sm font-medium transition-all', direction === 'yaml2json' ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']">
          YAML → JSON
        </button>
        <button @click="direction = 'json2yaml'" :class="['px-4 py-2 text-sm font-medium transition-all border-l border-gray-200 dark:border-slate-700', direction === 'json2yaml' ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']">
          JSON → YAML
        </button>
      </div>

      <div v-if="direction === 'yaml2json'" class="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
        <span>JSON 缩进：</span>
        <select v-model="indent" class="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 focus:outline-none">
          <option :value="2">2 空格</option>
          <option :value="4">4 空格</option>
        </select>
      </div>

      <div class="flex gap-2 ml-auto">
        <button @click="loadExample" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">示例</button>
        <button @click="input = ''" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-red-300 hover:text-red-500 transition-all">清空</button>
      </div>
    </div>

    <!-- 双栏编辑器 -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div class="flex flex-col gap-2">
        <span class="text-xs font-medium text-gray-500 dark:text-slate-500">{{ inputLabel }}</span>
        <textarea
          v-model="input"
          rows="20"
          :placeholder="`在此粘贴 ${inputLabel}...`"
          class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none leading-relaxed"
          spellcheck="false"
        ></textarea>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-gray-500 dark:text-slate-500">{{ outputLabel }}</span>
          <div class="flex gap-2">
            <button @click="swap" class="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">⇄ 互换</button>
            <button @click="copy" :class="['text-xs px-2.5 py-1 rounded-lg border transition-all', copied ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']">
              {{ copied ? '已复制' : '复制' }}
            </button>
          </div>
        </div>

        <div v-if="!result.ok && result.error" class="text-xs text-red-500 dark:text-red-400 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">{{ result.error }}</div>

        <pre class="flex-1 min-h-[480px] px-4 py-3 text-sm font-mono rounded-xl border border-slate-700 bg-slate-900 text-slate-200 overflow-auto whitespace-pre leading-relaxed"><code>{{ result.ok ? (result.output || '转换结果将显示在这里') : '' }}</code></pre>
      </div>
    </div>
  </div>
</template>
