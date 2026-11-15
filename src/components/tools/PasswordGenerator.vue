<script setup lang="ts">
// ============================================================
// PasswordGenerator — 随机密码生成器（crypto.getRandomValues）
// ============================================================

import { ref, computed, watch } from 'vue'

const length     = ref(16)
const useUpper   = ref(true)
const useLower   = ref(true)
const useNumbers = ref(true)
const useSymbols = ref(false)
const avoidAmbiguous = ref(false)  // 避免歧义字符 0/O/1/l/I
const result     = ref('')
const copied     = ref(false)
const strength    = ref<{ score: number; label: string; color: string }>({ score: 0, label: '', color: '' })

const charSets = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?~',
}

const ambiguousChars = new Set('0O1lI')

const availableChars = computed(() => {
  let chars = ''
  if (useUpper.value) chars += charSets.upper
  if (useLower.value) chars += charSets.lower
  if (useNumbers.value) chars += charSets.numbers
  if (useSymbols.value) chars += charSets.symbols
  if (avoidAmbiguous.value) chars = [...chars].filter(c => !ambiguousChars.has(c)).join('')
  return chars
})

// 使用 crypto.getRandomValues 安全随机
function secureRandomInt(max: number): number {
  const u32 = new Uint32Array(1)
  crypto.getRandomValues(u32)
  return u32[0] % max
}

function generate() {
  const chars = availableChars.value
  if (!chars) { result.value = ''; return }

  let pwd = ''
  // 保证至少包含每种选中的字符类型
  const required: string[] = []
  if (useUpper.value) required.push(charSets.upper)
  if (useLower.value) required.push(charSets.lower)
  if (useNumbers.value) required.push(charSets.numbers)
  if (useSymbols.value) required.push(charSets.symbols)

  for (const set of required) {
    const filtered = avoidAmbiguous.value ? [...set].filter(c => !ambiguousChars.has(c)).join('') : set
    if (filtered) pwd += filtered[secureRandomInt(filtered.length)]
  }

  // 剩余位随机填充
  while (pwd.length < length.value) {
    pwd += chars[secureRandomInt(chars.length)]
  }

  // 打乱顺序
  const arr = pwd.split('')
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  result.value = arr.join('')
  calcStrength()
}

function calcStrength() {
  const pwd = result.value
  if (!pwd) { strength.value = { score: 0, label: '', color: '' }; return }

  let score = 0
  // 长度
  if (pwd.length >= 8) score += 1
  if (pwd.length >= 12) score += 1
  if (pwd.length >= 16) score += 1
  if (pwd.length >= 24) score += 1
  // 字符类型
  if (/[a-z]/.test(pwd)) score += 1
  if (/[A-Z]/.test(pwd)) score += 1
  if (/[0-9]/.test(pwd)) score += 1
  if (/[^a-zA-Z0-9]/.test(pwd)) score += 2
  // 熵估算
  const pool = availableChars.value.length
  const entropy = pwd.length * Math.log2(pool || 1)
  if (entropy >= 60) score += 1
  if (entropy >= 100) score += 1

  const labels = [
    { min: 0, label: '极弱', color: 'text-red-500 dark:text-red-400' },
    { min: 3, label: '弱', color: 'text-orange-500 dark:text-orange-400' },
    { min: 5, label: '中等', color: 'text-amber-500 dark:text-amber-400' },
    { min: 7, label: '强', color: 'text-green-500 dark:text-green-400' },
    { min: 9, label: '极强', color: 'text-emerald-500 dark:text-emerald-400' },
  ]
  const matched = labels.filter(l => score >= l.min).pop()!
  strength.value = { score, label: matched.label, color: matched.color }
}

const entropy = computed(() => {
  if (!result.value) return 0
  const pool = availableChars.value.length
  return Math.round(result.value.length * Math.log2(pool || 1))
})

const copy = async () => {
  if (!result.value) return
  await navigator.clipboard.writeText(result.value)
  copied.value = true; setTimeout(() => { copied.value = false }, 2000)
}

// 初始生成
generate()
</script>

<template>
  <div class="space-y-5">
    <!-- 密码显示 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
      <div class="flex items-center gap-3">
        <code class="flex-1 text-lg font-mono font-bold text-gray-900 dark:text-white break-all tracking-wider select-all cursor-pointer" @click="copy">
          {{ result || '点击生成密码' }}
        </code>
        <button @click="copy" :disabled="!result" :class="['text-xs px-3 py-2 rounded-lg border transition-all disabled:opacity-40 flex-shrink-0', copied ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50']">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
      <!-- 强度条 -->
      <div v-if="result" class="mt-3 flex items-center gap-3">
        <div class="flex-1 flex gap-1">
          <div v-for="i in 10" :key="i" :class="['h-1.5 flex-1 rounded-full transition-all', i <= strength.score ? (strength.score >= 7 ? 'bg-green-500' : strength.score >= 5 ? 'bg-amber-500' : strength.score >= 3 ? 'bg-orange-500' : 'bg-red-500') : 'bg-gray-200 dark:bg-slate-700']"></div>
        </div>
        <span :class="['text-xs font-semibold', strength.color]">{{ strength.label }}</span>
        <span class="text-xs text-gray-400 dark:text-slate-600">{{ entropy }} bits</span>
      </div>
    </div>

    <!-- 生成按钮 -->
    <button @click="generate" class="w-full py-3 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
      重新生成
    </button>

    <!-- 配置 -->
    <div class="space-y-4">
      <!-- 长度 -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm font-medium text-gray-600 dark:text-slate-400">密码长度</label>
          <span class="text-sm font-mono font-bold text-accent-dark dark:text-accent">{{ length }}</span>
        </div>
        <input v-model.number="length" type="range" min="4" max="64" step="1" class="w-full accent-accent" @input="generate" />
        <div class="flex justify-between text-xs text-gray-400 dark:text-slate-600 mt-1">
          <span>4</span><span>16</span><span>32</span><span>64</span>
        </div>
      </div>

      <!-- 字符类型 -->
      <div class="grid grid-cols-2 gap-3">
        <label :class="['flex items-center gap-2 px-4 py-3 rounded-xl border cursor-pointer transition-all', useUpper ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-slate-700']">
          <input type="checkbox" v-model="useUpper" class="w-4 h-4 accent-accent" @change="generate" />
          <span class="text-sm text-gray-700 dark:text-slate-300">大写 A-Z</span>
        </label>
        <label :class="['flex items-center gap-2 px-4 py-3 rounded-xl border cursor-pointer transition-all', useLower ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-slate-700']">
          <input type="checkbox" v-model="useLower" class="w-4 h-4 accent-accent" @change="generate" />
          <span class="text-sm text-gray-700 dark:text-slate-300">小写 a-z</span>
        </label>
        <label :class="['flex items-center gap-2 px-4 py-3 rounded-xl border cursor-pointer transition-all', useNumbers ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-slate-700']">
          <input type="checkbox" v-model="useNumbers" class="w-4 h-4 accent-accent" @change="generate" />
          <span class="text-sm text-gray-700 dark:text-slate-300">数字 0-9</span>
        </label>
        <label :class="['flex items-center gap-2 px-4 py-3 rounded-xl border cursor-pointer transition-all', useSymbols ? 'border-accent bg-accent/5' : 'border-gray-200 dark:border-slate-700']">
          <input type="checkbox" v-model="useSymbols" class="w-4 h-4 accent-accent" @change="generate" />
          <span class="text-sm text-gray-700 dark:text-slate-300">符号 !@#$</span>
        </label>
      </div>

      <!-- 避免歧义 -->
      <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 cursor-pointer select-none">
        <input type="checkbox" v-model="avoidAmbiguous" class="w-4 h-4 accent-accent" @change="generate" />
        排除歧义字符（0/O/1/l/I）
      </label>
    </div>

    <!-- 安全说明 -->
    <div class="px-4 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-300">
      使用 <strong>crypto.getRandomValues</strong> 安全随机数生成器，密码<strong>不会离开浏览器</strong>。熵值 {{ entropy }} bits 意味着暴力破解需要约 2^{{ entropy }} 次尝试。
    </div>
  </div>
</template>
