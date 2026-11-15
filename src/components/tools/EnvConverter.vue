<script setup lang="ts">
// ============================================================
// EnvConverter — 环境变量格式转换工具
// ============================================================
// 支持：.env ↔ JSON ↔ export VAR=val ↔ Docker --env 四种格式互转

import { ref, computed } from 'vue'

type Format = 'dotenv' | 'json' | 'export' | 'docker'

const input = ref('')
const inputFormat = ref<Format>('dotenv')
const outputFormat = ref<Format>('json')
const copied = ref(false)

const formats: { key: Format; label: string; icon: string; example: string }[] = [
  { key: 'dotenv', label: '.env 文件', icon: '📄', example: 'DB_HOST=localhost\nDB_PORT=3306\n# 注释行\nAPP_NAME=MyApp' },
  { key: 'json',   label: 'JSON 对象', icon: '{}',  example: '{\n  "DB_HOST": "localhost",\n  "DB_PORT": "3306",\n  "APP_NAME": "MyApp"\n}' },
  { key: 'export', label: 'Shell export', icon: '$', example: 'export DB_HOST=localhost\nexport DB_PORT=3306\nexport APP_NAME=MyApp' },
  { key: 'docker', label: 'Docker --env', icon: '🐳', example: '--env DB_HOST=localhost \\\n--env DB_PORT=3306 \\\n--env APP_NAME=MyApp' },
]

// 解析任意格式为 Map
const parse = (raw: string, format: Format): Record<string, string> => {
  const result: Record<string, string> = {}
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))

  if (format === 'dotenv') {
    for (const line of lines) {
      const eqIdx = line.indexOf('=')
      if (eqIdx === -1) continue
      const key = line.slice(0, eqIdx).trim()
      let val = line.slice(eqIdx + 1).trim()
      // 去除首尾引号
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (key) result[key] = val
    }
  } else if (format === 'json') {
    try {
      const parsed = JSON.parse(raw.trim())
      for (const [k, v] of Object.entries(parsed)) {
        result[k] = String(v)
      }
    } catch { /* 解析失败忽略 */ }
  } else if (format === 'export') {
    for (const line of lines) {
      const m = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      result[m[1]] = val
    }
  } else if (format === 'docker') {
    // --env KEY=VAL 或 -e KEY=VAL
    const re = /(?:--env|-e)\s+([A-Za-z_][A-Za-z0-9_]*)=(.+?)(?:\s*\\?\s*$)/gm
    let m: RegExpExecArray | null
    while ((m = re.exec(raw)) !== null) {
      result[m[1]] = m[2].trim().replace(/\\$/, '').trim()
    }
  }
  return result
}

// 序列化为目标格式
const serialize = (data: Record<string, string>, format: Format): string => {
  const entries = Object.entries(data)
  if (!entries.length) return ''

  if (format === 'dotenv') {
    return entries.map(([k, v]) => {
      const needsQuote = v.includes(' ') || v.includes('#') || v.includes('"')
      return `${k}=${needsQuote ? `"${v.replace(/"/g, '\\"')}"` : v}`
    }).join('\n')
  } else if (format === 'json') {
    return JSON.stringify(Object.fromEntries(entries), null, 2)
  } else if (format === 'export') {
    return entries.map(([k, v]) => {
      const needsQuote = v.includes(' ') || v.includes('"')
      return `export ${k}=${needsQuote ? `"${v.replace(/"/g, '\\"')}"` : v}`
    }).join('\n')
  } else if (format === 'docker') {
    return entries
      .map(([k, v], i, arr) => `--env ${k}=${v}${i < arr.length - 1 ? ' \\' : ''}`)
      .join('\n')
  }
  return ''
}

interface ConvertResult { ok: boolean; output: string; count: number; error?: string }

const result = computed<ConvertResult>(() => {
  const raw = input.value.trim()
  if (!raw) return { ok: true, output: '', count: 0 }
  try {
    const data = parse(raw, inputFormat.value)
    const count = Object.keys(data).length
    if (!count) return { ok: false, output: '', count: 0, error: '未解析到有效的键值对，请检查输入格式' }
    const output = serialize(data, outputFormat.value)
    return { ok: true, output, count }
  } catch (e) {
    return { ok: false, output: '', count: 0, error: `解析失败：${e instanceof Error ? e.message : String(e)}` }
  }
})

const copy = async () => {
  if (!result.value.output) return
  await navigator.clipboard.writeText(result.value.output)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const loadExample = () => {
  const fmt = formats.find(f => f.key === inputFormat.value)
  if (fmt) input.value = fmt.example
}

const swap = () => {
  if (result.value.ok && result.value.output) {
    input.value = result.value.output
    const tmp = inputFormat.value
    inputFormat.value = outputFormat.value
    outputFormat.value = tmp
  }
}
</script>

<template>
  <div class="space-y-5">
    <!-- 格式选择 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-2">输入格式</label>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="f in formats" :key="f.key" @click="inputFormat = f.key"
            :class="['px-3 py-2 text-sm rounded-xl border transition-all text-left', inputFormat === f.key ? 'bg-accent text-white border-accent' : 'bg-white dark:bg-slate-900/50 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40']"
          >
            <span class="font-mono text-xs mr-1.5">{{ f.icon }}</span>{{ f.label }}
          </button>
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-2">输出格式</label>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="f in formats" :key="f.key" @click="outputFormat = f.key"
            :class="['px-3 py-2 text-sm rounded-xl border transition-all text-left', outputFormat === f.key ? 'bg-purple-500 text-white border-purple-500' : 'bg-white dark:bg-slate-900/50 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-purple-400/40']"
          >
            <span class="font-mono text-xs mr-1.5">{{ f.icon }}</span>{{ f.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- 输入输出双栏 -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <!-- 输入 -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500 dark:text-slate-500">输入（{{ formats.find(f=>f.key===inputFormat)?.label }}）</span>
          <div class="flex gap-2">
            <button @click="loadExample" class="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">示例</button>
            <button @click="input = ''" class="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-red-300 hover:text-red-500 transition-all">清空</button>
          </div>
        </div>
        <textarea
          v-model="input"
          rows="14"
          :placeholder="formats.find(f=>f.key===inputFormat)?.example || ''"
          class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none leading-relaxed"
          spellcheck="false"
        ></textarea>
      </div>

      <!-- 输出 -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500 dark:text-slate-500">
            输出（{{ formats.find(f=>f.key===outputFormat)?.label }}）
            <span v-if="result.ok && result.count" class="ml-1 text-accent">{{ result.count }} 个变量</span>
          </span>
          <div class="flex gap-2">
            <button @click="swap" class="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">⇄ 互换</button>
            <button @click="copy" :class="['text-xs px-2.5 py-1 rounded border transition-all', copied ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']">
              {{ copied ? '已复制' : '复制' }}
            </button>
          </div>
        </div>

        <!-- 错误 -->
        <div v-if="!result.ok && result.error" class="text-xs text-red-500 dark:text-red-400 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          {{ result.error }}
        </div>

        <pre class="flex-1 min-h-[320px] px-4 py-3 text-sm font-mono rounded-xl border border-slate-700 bg-slate-900 text-slate-200 overflow-auto whitespace-pre leading-relaxed"><code>{{ result.ok ? (result.output || '转换结果将显示在这里') : '' }}</code></pre>
      </div>
    </div>

    <!-- 提示 -->
    <div class="text-xs text-gray-400 dark:text-slate-600 flex items-start gap-2">
      <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <span>支持自动去除注释行（# 开头）；JSON 格式的数值会自动转为字符串；所有处理均在浏览器本地完成，<strong class="text-gray-500 dark:text-slate-500">不会上传任何数据。</strong></span>
    </div>
  </div>
</template>
