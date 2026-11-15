<script setup lang="ts">
// ============================================================
// JsonFormatter — JSON 格式化 / 压缩 / 转义工具
// ============================================================
// 功能：
// 1. 格式化（美化）JSON，支持缩进选择（2/4 空格 / Tab）
// 2. 压缩（Minify）JSON
// 3. 转义（字符串中的 JSON 转为可嵌入代码的字符串）
// 4. 反转义
// 5. 错误定位（高亮错误行）
// 6. 一键复制 / 清空
// ============================================================

import { ref, computed } from 'vue'

type Mode = 'format' | 'minify' | 'escape' | 'unescape'
type Indent = 2 | 4 | 'tab'

const input = ref('')
const mode = ref<Mode>('format')
const indent = ref<Indent>(2)
const copied = ref(false)

const modes = [
  { key: 'format' as Mode,   label: '格式化', icon: '✨' },
  { key: 'minify' as Mode,   label: '压缩',   icon: '📦' },
  { key: 'escape' as Mode,   label: '转义',   icon: '🔤' },
  { key: 'unescape' as Mode, label: '反转义', icon: '🔓' },
]

interface ProcessResult {
  ok: boolean
  output: string
  error?: string
  errorLine?: number
  stats?: { inputLen: number; outputLen: number; ratio: string }
}

const result = computed<ProcessResult>(() => {
  const raw = input.value
  if (!raw.trim()) return { ok: true, output: '' }

  try {
    if (mode.value === 'format') {
      const parsed = JSON.parse(raw)
      const indentStr = indent.value === 'tab' ? '\t' : indent.value
      const output = JSON.stringify(parsed, null, indentStr)
      return {
        ok: true, output,
        stats: {
          inputLen: raw.length,
          outputLen: output.length,
          ratio: ((output.length / raw.length) * 100 - 100).toFixed(1),
        },
      }
    }

    if (mode.value === 'minify') {
      const parsed = JSON.parse(raw)
      const output = JSON.stringify(parsed)
      const saved = raw.length - output.length
      return {
        ok: true, output,
        stats: {
          inputLen: raw.length,
          outputLen: output.length,
          ratio: `-${((saved / raw.length) * 100).toFixed(1)}`,
        },
      }
    }

    if (mode.value === 'escape') {
      // 先验证是合法 JSON
      JSON.parse(raw)
      const output = JSON.stringify(raw)
      return { ok: true, output }
    }

    if (mode.value === 'unescape') {
      // 尝试 JSON.parse 解析转义字符串
      const unescaped = JSON.parse(raw)
      if (typeof unescaped !== 'string') {
        return { ok: false, output: '', error: '反转义失败：输入不是一个 JSON 字符串（请确保外层有引号）' }
      }
      // 再格式化内部 JSON
      try {
        const inner = JSON.parse(unescaped)
        return { ok: true, output: JSON.stringify(inner, null, 2) }
      } catch {
        return { ok: true, output: unescaped }
      }
    }

    return { ok: true, output: raw }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // 尝试提取错误行号
    const lineMatch = msg.match(/line (\d+)/)
    const errorLine = lineMatch ? parseInt(lineMatch[1]) : undefined
    return { ok: false, output: '', error: msg, errorLine }
  }
})

// 行数统计
const inputLineCount = computed(() => input.value ? input.value.split('\n').length : 0)
const outputLineCount = computed(() => result.value.output ? result.value.output.split('\n').length : 0)

const copy = async () => {
  if (!result.value.output) return
  await navigator.clipboard.writeText(result.value.output)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const clear = () => { input.value = '' }

const loadDemo = () => {
  input.value = `{"name":"ToolHub","version":"1.0.0","description":"技术项目在线演示中心","author":{"name":"开发者","email":"dev@example.com"},"tools":["nginx-config","jwt-decoder","json-formatter"],"settings":{"theme":"dark","language":"zh-CN","pagination":{"pageSize":12,"showTotal":true}}}`
}

// 将输出填入输入（管道操作）
const pipeOutput = () => {
  if (result.value.ok && result.value.output) {
    input.value = result.value.output
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 模式选择 + 缩进选项 -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        <button
          v-for="m in modes"
          :key="m.key"
          @click="mode = m.key"
          :class="[
            'px-4 py-2 text-sm font-medium transition-all border-r border-gray-200 dark:border-slate-700 last:border-r-0',
            mode === m.key
              ? 'bg-accent text-white'
              : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
          ]"
        >
          <span class="mr-1">{{ m.icon }}</span>{{ m.label }}
        </button>
      </div>

      <!-- 缩进选项（仅格式化模式显示） -->
      <div v-if="mode === 'format'" class="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
        <span>缩进：</span>
        <select v-model="indent" class="px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-accent/30">
          <option :value="2">2 空格</option>
          <option :value="4">4 空格</option>
          <option value="tab">Tab</option>
        </select>
      </div>
    </div>

    <!-- 输入输出双栏 -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <!-- 输入 -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500 dark:text-slate-500">
            输入
            <span v-if="inputLineCount > 0" class="ml-1 text-gray-400 dark:text-slate-600">{{ inputLineCount }} 行 · {{ input.length }} 字符</span>
          </span>
          <div class="flex gap-2">
            <button @click="loadDemo" class="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">示例</button>
            <button @click="clear" class="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-red-300 hover:text-red-500 transition-all">清空</button>
          </div>
        </div>
        <textarea
          v-model="input"
          rows="18"
          placeholder='粘贴 JSON 数据，例如：{"key":"value"}'
          :class="[
            'w-full px-4 py-3 text-sm font-mono rounded-xl border bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none transition-all leading-relaxed',
            !result.ok && input.trim()
              ? 'border-red-300 dark:border-red-700 focus:ring-red-300/30'
              : 'border-gray-200 dark:border-slate-700 focus:border-accent/50'
          ]"
          spellcheck="false"
        ></textarea>

        <!-- 错误提示 -->
        <div v-if="!result.ok && result.error" class="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div>
            <span class="font-medium">解析错误</span>
            <span v-if="result.errorLine"> · 第 {{ result.errorLine }} 行</span>
            <br/>{{ result.error }}
          </div>
        </div>
      </div>

      <!-- 输出 -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500 dark:text-slate-500">
            输出
            <span v-if="result.ok && result.output" class="ml-1 text-gray-400 dark:text-slate-600">
              {{ outputLineCount }} 行 · {{ result.output.length }} 字符
            </span>
            <span v-if="result.stats" class="ml-2 text-accent dark:text-accent">
              {{ Number(result.stats.ratio) > 0 ? '+' : '' }}{{ result.stats.ratio }}%
            </span>
          </span>
          <div class="flex gap-2">
            <button
              v-if="result.ok && result.output"
              @click="pipeOutput"
              title="将输出作为下一次的输入"
              class="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all"
            >→ 输入</button>
            <button
              @click="copy"
              :class="[
                'text-xs px-2.5 py-1 rounded border transition-all',
                copied
                  ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                  : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent'
              ]"
            >{{ copied ? '已复制' : '复制' }}</button>
          </div>
        </div>
        <pre :class="[
          'flex-1 min-h-[400px] px-4 py-3 text-sm font-mono rounded-xl border overflow-auto whitespace-pre-wrap break-all leading-relaxed',
          result.ok
            ? 'bg-slate-900 text-slate-200 border-slate-700'
            : 'bg-gray-50 dark:bg-slate-900/30 text-gray-400 dark:text-slate-600 border-gray-200 dark:border-slate-800'
        ]"><code>{{ result.ok ? (result.output || '处理结果将显示在这里') : '' }}</code></pre>
      </div>
    </div>
  </div>
</template>
