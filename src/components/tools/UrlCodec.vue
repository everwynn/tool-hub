<script setup lang="ts">
// ============================================================
// UrlCodec — URL 编解码工具
// ============================================================

import { ref, computed, watch } from 'vue'

type Mode   = 'encode' | 'decode'
type Level  = 'component' | 'full' | 'query'

const mode      = ref<Mode>('encode')
const level     = ref<Level>('component')
const inputText = ref('')
const copied    = ref(false)

// ---- 核心逻辑 ----
function encode(text: string, lv: Level): string {
  try {
    if (lv === 'component') return encodeURIComponent(text)
    if (lv === 'full')      return encodeURI(text)
    // query：值级别编码（连 & 和 = 也编码，用于值内部）
    return encodeURIComponent(text)
  } catch { return '编码失败：输入包含非法字符' }
}

function decode(text: string): string {
  try {
    // 先尝试 decodeURIComponent，失败则 decodeURI
    return decodeURIComponent(text)
  } catch {
    try { return decodeURI(text) }
    catch (e) { return `解码失败：${e instanceof Error ? e.message : String(e)}` }
  }
}

const output = computed(() => {
  if (!inputText.value) return ''
  return mode.value === 'encode' ? encode(inputText.value, level.value) : decode(inputText.value)
})

const charDiff = computed(() => {
  const a = inputText.value.length
  const b = output.value.length
  if (!a || !b) return null
  const ratio = ((b - a) / a * 100).toFixed(0)
  return { a, b, ratio: Number(ratio) }
})

// 编码对比：直观展示哪些字符被编码了
const diffHighlight = computed(() => {
  if (mode.value !== 'encode' || !inputText.value) return ''
  const out = output.value
  // 将百分号编码序列标红，普通字符保持原色
  return out.replace(/%[0-9A-F]{2}/gi, m => `<mark>${m}</mark>`)
})

const levelInfo: Record<Level, { label: string; desc: string; keep: string }> = {
  component: { label: 'encodeURIComponent', desc: '编码除 A-Z a-z 0-9 - _ . ! ~ * \' ( ) 外的所有字符，用于编码 URL 参数值', keep: 'A-Za-z0-9-_.!~*\'()' },
  full:      { label: 'encodeURI',          desc: '只编码空格和特殊字符，保留 URL 的结构字符（: / ? # @ = &），用于编码整个 URL', keep: '保留 URL 结构字符' },
  query:     { label: '查询参数编码',        desc: '与 encodeURIComponent 相同，但更直观地展示用于拼接查询字符串参数值的场景', keep: 'A-Za-z0-9-_.!~*\'()' },
}

// URL 解析
const parseResult = computed(() => {
  if (mode.value !== 'decode') return null
  try {
    const url = new URL(inputText.value.trim().includes('://') ? inputText.value.trim() : 'https://placeholder.com/?' + inputText.value.trim())
    const params: { key: string; value: string }[] = []
    url.searchParams.forEach((v, k) => params.push({ key: k, value: v }))
    if (!inputText.value.trim().includes('://')) {
      return params.length ? { params, isQuery: true } : null
    }
    return {
      protocol: url.protocol.replace(':', ''),
      host: url.host,
      pathname: url.pathname !== '/' ? url.pathname : '',
      params,
      hash: url.hash,
      isQuery: false,
    }
  } catch { return null }
})

// 常见场景示例
const examples = [
  { label: '带特殊字符的参数值', value: '你好世界 Hello & World=100%', isEncode: true },
  { label: '完整 URL', value: 'https://example.com/search?q=你好&page=1#结果', isEncode: true },
  { label: 'URI 组件编码', value: 'user@example.com/path?a=b&c=d', isEncode: true },
  { label: '解码百分号编码', value: '%E4%BD%A0%E5%A5%BD%E4%B8%96%E7%95%8C%20Hello%20World', isEncode: false },
  { label: '解码 URL 参数', value: 'q=%E6%90%9C%E7%B4%A2%E5%85%B3%E9%94%AE%E8%AF%8D&page=1&sort=asc', isEncode: false },
]

const loadExample = (ex: typeof examples[0]) => {
  inputText.value = ex.value
  mode.value = ex.isEncode ? 'encode' : 'decode'
  if (ex.isEncode) level.value = 'component'
}

const copy = async () => {
  if (!output.value) return
  await navigator.clipboard.writeText(output.value)
  copied.value = true; setTimeout(() => { copied.value = false }, 2000)
}

const swap = () => {
  if (output.value && !output.value.startsWith('解码失败') && !output.value.startsWith('编码失败')) {
    inputText.value = output.value
    mode.value = mode.value === 'encode' ? 'decode' : 'encode'
  }
}
</script>

<template>
  <div class="space-y-5">
    <!-- 模式 + 级别选择 -->
    <div class="flex flex-wrap gap-3 items-center">
      <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
        <button v-for="m in [{ key:'encode', label:'🔡 编码' }, { key:'decode', label:'🔤 解码' }]" :key="m.key"
          @click="mode = m.key as Mode"
          :class="['px-4 py-2 text-sm font-medium transition-all border-r last:border-r-0 border-gray-200 dark:border-slate-700', mode === m.key ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']"
        >{{ m.label }}</button>
      </div>

      <template v-if="mode === 'encode'">
        <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
          <button v-for="lv in (['component', 'full', 'query'] as Level[])" :key="lv"
            @click="level = lv"
            :class="['px-3 py-2 text-xs font-medium transition-all border-r last:border-r-0 border-gray-200 dark:border-slate-700', level === lv ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']"
          >{{ levelInfo[lv].label }}</button>
        </div>
      </template>
    </div>

    <!-- 编码级别说明 -->
    <div v-if="mode === 'encode'" class="px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-xs text-blue-600 dark:text-blue-400">
      <strong>{{ levelInfo[level].label }}：</strong>{{ levelInfo[level].desc }}
      <span class="ml-2 opacity-70">保留字符：{{ levelInfo[level].keep }}</span>
    </div>

    <!-- 输入 -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-medium text-gray-600 dark:text-slate-400">{{ mode === 'encode' ? '原始文本 / URL' : '编码后的字符串' }}</span>
        <button @click="inputText = ''" v-if="inputText" class="text-xs text-gray-400 hover:text-red-500 transition-colors">清空</button>
      </div>
      <textarea v-model="inputText" rows="5"
        :placeholder="mode === 'encode' ? '输入要编码的文本、URL 或参数值...' : '粘贴百分号编码的字符串，如 %E4%BD%A0%E5%A5%BD...'"
        class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none"
        spellcheck="false"></textarea>
    </div>

    <!-- 输出 -->
    <div v-if="output">
      <div class="flex items-center justify-between mb-1.5">
        <div class="flex items-center gap-3">
          <span class="text-xs font-medium text-gray-600 dark:text-slate-400">{{ mode === 'encode' ? '编码结果' : '解码结果' }}</span>
          <span v-if="charDiff" :class="['text-xs', charDiff.ratio > 0 ? 'text-amber-500' : 'text-green-500']">
            {{ charDiff.a }} → {{ charDiff.b }} 字符
            <span class="opacity-70">（{{ charDiff.ratio > 0 ? '+' : '' }}{{ charDiff.ratio }}%）</span>
          </span>
        </div>
        <div class="flex gap-2">
          <button @click="swap" class="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">⇄ 互换</button>
          <button @click="copy" :class="['text-xs px-2.5 py-1 rounded-lg border transition-all', copied ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-accent/50']">
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
      </div>

      <!-- 高亮显示（编码模式）-->
      <div v-if="mode === 'encode'" class="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-sm font-mono text-gray-700 dark:text-slate-300 break-all leading-relaxed"
        v-html="diffHighlight || output"
      ></div>
      <pre v-else class="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-sm font-mono text-gray-700 dark:text-slate-300 break-all leading-relaxed whitespace-pre-wrap">{{ output }}</pre>

      <!-- 高亮说明 -->
      <div v-if="mode === 'encode' && diffHighlight" class="mt-1.5 text-xs text-gray-400 dark:text-slate-600 flex items-center gap-1.5">
        <mark class="px-1 rounded text-xs">%XX</mark>
        <span>= 被编码的字符（百分号编码）</span>
      </div>
    </div>

    <!-- URL 解析面板（解码模式）-->
    <div v-if="parseResult && mode === 'decode'" class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 overflow-hidden">
      <div class="px-4 py-2.5 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
        <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">URL 解析</span>
      </div>
      <div class="p-4 space-y-2">
        <div v-if="!parseResult.isQuery" class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div v-if="parseResult.protocol" class="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700">
            <div class="text-gray-400 dark:text-slate-600 mb-0.5">协议</div>
            <div class="font-mono font-medium text-blue-600 dark:text-blue-400">{{ parseResult.protocol }}</div>
          </div>
          <div v-if="parseResult.host" class="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700">
            <div class="text-gray-400 dark:text-slate-600 mb-0.5">主机</div>
            <div class="font-mono font-medium text-emerald-600 dark:text-emerald-400 break-all">{{ parseResult.host }}</div>
          </div>
          <div v-if="parseResult.pathname" class="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700">
            <div class="text-gray-400 dark:text-slate-600 mb-0.5">路径</div>
            <div class="font-mono font-medium text-gray-700 dark:text-slate-300 break-all">{{ parseResult.pathname }}</div>
          </div>
          <div v-if="parseResult.hash" class="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700">
            <div class="text-gray-400 dark:text-slate-600 mb-0.5">锚点</div>
            <div class="font-mono font-medium text-purple-600 dark:text-purple-400 break-all">{{ parseResult.hash }}</div>
          </div>
        </div>
        <div v-if="parseResult.params.length" class="space-y-1">
          <div class="text-xs text-gray-400 dark:text-slate-600 mb-2">查询参数（{{ parseResult.params.length }} 个）</div>
          <div v-for="p in parseResult.params" :key="p.key" class="flex gap-2 items-start text-xs font-mono">
            <span class="px-2 py-1 rounded bg-accent/10 text-accent-dark dark:text-accent font-medium flex-shrink-0 max-w-[200px] truncate">{{ p.key }}</span>
            <span class="text-gray-400 dark:text-slate-600 py-1">=</span>
            <span class="px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 break-all">{{ p.value }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!inputText" class="py-6 text-center text-gray-300 dark:text-slate-700 text-sm">
      输入内容后实时{{ mode === 'encode' ? '编码' : '解码' }}
    </div>

    <!-- 常见示例 -->
    <div class="space-y-2">
      <h3 class="text-xs font-semibold text-gray-500 dark:text-slate-500">快速示例</h3>
      <div class="flex flex-wrap gap-2">
        <button v-for="ex in examples" :key="ex.label" @click="loadExample(ex)"
          class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent-dark dark:hover:text-accent transition-all"
        >{{ ex.label }}</button>
      </div>
    </div>

    <!-- 速查表 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div class="px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
        <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">常见字符编码速查</span>
      </div>
      <div class="grid grid-cols-3 sm:grid-cols-6 text-xs font-mono">
        <div v-for="item in [
          { char: '空格', enc: '%20' }, { char: '+',  enc: '%2B' }, { char: '=',  enc: '%3D' },
          { char: '&',   enc: '%26' }, { char: '/',  enc: '%2F' }, { char: '?',  enc: '%3F' },
          { char: '#',   enc: '%23' }, { char: '@',  enc: '%40' }, { char: ':',  enc: '%3A' },
          { char: '!',   enc: '%21' }, { char: 'quot', enc: '%22' }, { char: '%',  enc: '%25' },
        ]" :key="item.char"
          class="flex items-center justify-center gap-2 px-3 py-2 border-r border-b border-gray-100 dark:border-slate-800 last:border-r-0"
        >
          <span class="text-gray-400 dark:text-slate-500">{{ item.char }}</span>
          <span class="text-gray-300 dark:text-slate-700">→</span>
          <span class="text-accent-dark dark:text-accent font-semibold">{{ item.enc }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
mark {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  padding: 0 1px;
  border-radius: 2px;
}
.dark mark {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}
</style>
