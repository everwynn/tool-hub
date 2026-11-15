<script setup lang="ts">
// ============================================================
// BaseConverter — 数字进制转换器
// ============================================================

import { ref, computed, watch } from 'vue'

type Base = 2 | 8 | 10 | 16

const inputValue  = ref('')
const inputBase   = ref<Base>(10)
const errorMsg    = ref('')
const copied      = ref<string>('')

// 清理输入：去掉空格/前缀
function clean(val: string, base: Base): string {
  val = val.trim().replace(/\s/g, '')
  if (base === 16) val = val.replace(/^0x/i, '')
  if (base === 2)  val = val.replace(/^0b/i, '')
  if (base === 8)  val = val.replace(/^0o/i, '')
  return val
}

const parsed = computed((): bigint | null => {
  if (!inputValue.value) return null
  try {
    const val = clean(inputValue.value, inputBase.value)
    if (!val) return null
    const n = BigInt(parseInt(val, inputBase.value))
    if (isNaN(Number(BigInt(parseInt(val, inputBase.value))))) return null
    // 验证合法性
    const valid = '0123456789abcdef'.slice(0, inputBase.value === 16 ? 16 : inputBase.value)
    if ([...val.toLowerCase()].some(c => !valid.includes(c))) {
      errorMsg.value = `包含非${inputBase.value}进制字符`
      return null
    }
    errorMsg.value = ''
    return BigInt('0x' + parseInt(val, inputBase.value).toString(16))
  } catch (e) {
    errorMsg.value = `解析失败：输入可能超出范围`
    return null
  }
})

// 各进制结果
const results = computed(() => {
  const n = parsed.value
  if (n === null) return null
  const num = Number(n)
  return {
    bin: num.toString(2),
    oct: num.toString(8),
    dec: num.toString(10),
    hex: num.toString(16).toUpperCase(),
    hexLower: num.toString(16),
  }
})

// 二进制分组显示（每4位加空格）
const binGrouped = computed(() => {
  if (!results.value) return ''
  return results.value.bin.replace(/(\d{4})(?=\d)/g, '$1 ')
})

// 二进制字节展示
const binBytes = computed(() => {
  if (!results.value) return []
  const bin = results.value.bin.padStart(Math.ceil(results.value.bin.length / 8) * 8, '0')
  const bytes: string[] = []
  for (let i = 0; i < bin.length; i += 8) bytes.push(bin.slice(i, i + 8))
  return bytes
})

// ASCII 字符（0-127）
const asciiChar = computed(() => {
  const n = parsed.value !== null ? Number(parsed.value) : null
  if (n === null || n < 0 || n > 127) return null
  if (n < 32) {
    const ctrlChars: Record<number, string> = { 0:'NUL',1:'SOH',2:'STX',3:'ETX',4:'EOT',5:'ENQ',6:'ACK',7:'BEL',8:'BS',9:'HT',10:'LF',11:'VT',12:'FF',13:'CR',14:'SO',15:'SI',27:'ESC',32:'SP' }
    return ctrlChars[n] ? `控制字符 ${ctrlChars[n]}` : `控制字符 ^${String.fromCharCode(n + 64)}`
  }
  return String.fromCharCode(n)
})

// 快捷跳转：常用值
const quickValues = [
  { label: '0', val: '0', base: 10 as Base },
  { label: '1', val: '1', base: 10 as Base },
  { label: '255 (0xFF)', val: '255', base: 10 as Base },
  { label: '256', val: '256', base: 10 as Base },
  { label: '1024 (1K)', val: '1024', base: 10 as Base },
  { label: '0xDEADBEEF', val: 'DEADBEEF', base: 16 as Base },
  { label: '0b11001010', val: '11001010', base: 2 as Base },
  { label: '0o755', val: '755', base: 8 as Base },
  { label: '65 (A)', val: '65', base: 10 as Base },
  { label: '127 (DEL)', val: '127', base: 10 as Base },
]

const loadQuick = (q: typeof quickValues[0]) => {
  inputBase.value = q.base; inputValue.value = q.val
}

const copy = async (text: string, key: string) => {
  await navigator.clipboard.writeText(text)
  copied.value = key; setTimeout(() => { copied.value = '' }, 2000)
}

const baseLabels: Record<Base, string> = {
  2: '二进制 (BIN)',
  8: '八进制 (OCT)',
  10: '十进制 (DEC)',
  16: '十六进制 (HEX)',
}
const basePlaceholders: Record<Base, string> = {
  2:  '输入二进制数，如 11001010',
  8:  '输入八进制数，如 755',
  10: '输入十进制数，如 42',
  16: '输入十六进制数，如 FF 或 0xFF',
}
const baseColors: Record<Base, string> = {
  2:  'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
  8:  'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
  10: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
  16: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
}
</script>

<template>
  <div class="space-y-5">
    <!-- 进制选择 -->
    <div class="flex flex-wrap gap-2">
      <span class="text-sm text-gray-500 dark:text-slate-400 self-center mr-1">输入进制：</span>
      <button v-for="b in ([2, 8, 10, 16] as Base[])" :key="b"
        @click="inputBase = b; inputValue = ''"
        :class="['px-4 py-2 text-sm font-medium rounded-xl border transition-all', inputBase === b ? 'bg-accent text-white border-accent' : 'bg-white dark:bg-slate-900/50 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40']"
      >{{ b }}进制</button>
    </div>

    <!-- 输入框 -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-medium text-gray-600 dark:text-slate-400">{{ baseLabels[inputBase] }}</span>
        <button @click="inputValue = ''" v-if="inputValue" class="text-xs text-gray-400 hover:text-red-500 transition-colors">清空</button>
      </div>
      <input
        v-model="inputValue"
        type="text"
        :placeholder="basePlaceholders[inputBase]"
        spellcheck="false"
        class="w-full px-4 py-3 text-lg font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 tracking-wider"
      />
      <div v-if="errorMsg" class="mt-1 text-xs text-red-500 dark:text-red-400">{{ errorMsg }}</div>
    </div>

    <!-- 结果卡片 -->
    <div v-if="results" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div v-for="item in [
        { key: 'bin', base: 2,  label: '二进制', prefix: '0b', value: results.bin,       color: baseColors[2]  },
        { key: 'oct', base: 8,  label: '八进制', prefix: '0o', value: results.oct,       color: baseColors[8]  },
        { key: 'dec', base: 10, label: '十进制', prefix: '',   value: results.dec,       color: baseColors[10] },
        { key: 'hex', base: 16, label: '十六进制',prefix: '0x', value: results.hex,      color: baseColors[16] },
      ]" :key="item.key"
        :class="['rounded-xl border px-4 py-3 transition-all', item.base === inputBase ? item.color + ' ring-2 ring-offset-1 ring-current/30' : 'bg-white dark:bg-slate-900/40 border-gray-200 dark:border-slate-700']"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-current opacity-80">{{ item.label }}</span>
            <span class="text-xs text-current opacity-50">{{ item.prefix }}</span>
            <span v-if="item.base === inputBase" class="text-xs px-1.5 py-0.5 rounded bg-current/10 opacity-70">输入</span>
          </div>
          <button @click="copy(item.value, item.key)"
            :class="['text-xs px-2 py-0.5 rounded border transition-all', copied === item.key ? 'border-green-400 text-green-600 dark:text-green-400' : 'border-current/20 text-current opacity-60 hover:opacity-100']"
          >{{ copied === item.key ? '已复制' : '复制' }}</button>
        </div>
        <code class="block text-base font-mono font-semibold break-all">
          {{ item.key === 'bin' ? binGrouped : (item.key === 'hex' ? '0x' + item.value : item.prefix + item.value) }}
        </code>
        <!-- 十进制数字标注大小 -->
        <div v-if="item.key === 'dec'" class="mt-1 text-xs opacity-50">
          {{ Number(item.value).toLocaleString() }}
        </div>
        <!-- 十六进制也显示小写 -->
        <div v-if="item.key === 'hex'" class="mt-1 text-xs opacity-50">小写：0x{{ results.hexLower }}</div>
      </div>
    </div>

    <!-- 二进制字节可视化 -->
    <div v-if="results && binBytes.length" class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-semibold text-gray-700 dark:text-slate-200">位图可视化</span>
        <span class="text-xs text-gray-400 dark:text-slate-600">{{ results.bin.length }} 位 · {{ binBytes.length }} 字节</span>
      </div>
      <div class="flex flex-wrap gap-3">
        <div v-for="(byte, bi) in binBytes" :key="bi" class="flex flex-col items-center gap-1">
          <div class="flex gap-0.5">
            <div v-for="(bit, bti) in byte.split('')" :key="bti"
              :class="['w-6 h-8 rounded flex items-center justify-center text-xs font-mono font-bold border transition-all',
                bit === '1'
                  ? 'bg-accent text-white border-accent/50'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-600 border-gray-200 dark:border-slate-700'
              ]"
            >{{ bit }}</div>
          </div>
          <span class="text-xs text-gray-400 dark:text-slate-600 font-mono">{{ parseInt(byte, 2).toString(16).padStart(2, '0').toUpperCase() }}</span>
        </div>
      </div>
    </div>

    <!-- ASCII 字符信息 -->
    <div v-if="asciiChar !== null && results" class="flex items-center gap-4 px-4 py-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800">
      <div class="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-700 flex items-center justify-center text-2xl font-mono font-bold text-purple-700 dark:text-purple-300 flex-shrink-0">
        {{ asciiChar.length === 1 ? asciiChar : '?' }}
      </div>
      <div class="text-xs text-purple-600 dark:text-purple-400">
        <div class="font-semibold mb-0.5">ASCII 字符</div>
        <div>{{ asciiChar }}（十进制 {{ results.dec }}，十六进制 0x{{ results.hex }}）</div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!inputValue" class="py-6 text-center text-gray-300 dark:text-slate-700 text-sm">
      输入数字后自动转换到各进制
    </div>

    <!-- 快速示例 -->
    <div class="space-y-2">
      <h3 class="text-xs font-semibold text-gray-500 dark:text-slate-500">快速示例</h3>
      <div class="flex flex-wrap gap-2">
        <button v-for="q in quickValues" :key="q.label" @click="loadQuick(q)"
          class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent-dark dark:hover:text-accent transition-all font-mono"
        >{{ q.label }}</button>
      </div>
    </div>

    <!-- 进制速查表 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div class="px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
        <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">0~15 进制速查</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs font-mono">
          <thead>
            <tr class="border-b border-gray-100 dark:border-slate-800">
              <th v-for="h in ['十进制', '十六进制', '八进制', '二进制']" :key="h"
                class="px-4 py-2 text-left text-gray-500 dark:text-slate-500 font-semibold">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in 16" :key="n" :class="['border-b border-gray-50 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/30', n % 2 === 0 ? 'bg-transparent' : 'bg-gray-50/50 dark:bg-slate-900/20']">
              <td class="px-4 py-1.5 text-emerald-600 dark:text-emerald-400">{{ n - 1 }}</td>
              <td class="px-4 py-1.5 text-blue-600 dark:text-blue-400">{{ (n - 1).toString(16).toUpperCase() }}</td>
              <td class="px-4 py-1.5 text-amber-600 dark:text-amber-400">{{ (n - 1).toString(8) }}</td>
              <td class="px-4 py-1.5 text-rose-600 dark:text-rose-400">{{ (n - 1).toString(2).padStart(4, '0') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
