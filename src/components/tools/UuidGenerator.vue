<script setup lang="ts">
// ============================================================
// UuidGenerator — UUID 生成器（crypto.randomUUID + 手写 v1）
// ============================================================

import { ref, computed } from 'vue'

type UuidVersion = 'v4' | 'v1' | 'nil'

const version    = ref<UuidVersion>('v4')
const count      = ref(5)
const uppercase = ref(false)
const hyphens   = ref(true)
const brace     = ref(false)
const result    = ref<string[]>([])
const copiedKey = ref<string>('')

function generateV4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0'))
  return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`
}

function generateV1(): string {
  const now = Date.now()
  const ts = (now - 0x01b21dd213814000) * 10000
  const timeLow = (ts & 0xFFFFFFFF) >>> 0
  const timeMid = ((ts >>> 32) & 0xFFFF) >>> 0
  const timeHi = (((ts >>> 48) & 0x0FFF) | 0x1000) >>> 0
  const clockSeq = crypto.getRandomValues(new Uint8Array(2))
  clockSeq[0] = (clockSeq[0] & 0x3f) | 0x80
  const node = crypto.getRandomValues(new Uint8Array(6))
  node[0] = node[0] | 0x01
  const hex = (n: number, len: number) => n.toString(16).padStart(len, '0')
  const b2h = (arr: Uint8Array) => Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex(timeLow, 8)}-${hex(timeMid, 4)}-${hex(timeHi, 4)}-${b2h(clockSeq)}-${b2h(node)}`
}

function generateNil(): string {
  return '00000000-0000-0000-0000-000000000000'
}

function formatUuid(uuid: string): string {
  let u = uuid
  if (!hyphens.value) u = u.replace(/-/g, '')
  if (uppercase.value) u = u.toUpperCase()
  if (brace.value) u = `{${u}}`
  return u
}

function generate() {
  const raw: string[] = []
  for (let i = 0; i < count.value; i++) {
    if (version.value === 'v4') raw.push(generateV4())
    else if (version.value === 'v1') raw.push(generateV1())
    else raw.push(generateNil())
  }
  result.value = raw.map(formatUuid)
}

const copyAll = async () => {
  await navigator.clipboard.writeText(result.value.join('\n'))
  copiedKey.value = 'all'; setTimeout(() => { copiedKey.value = '' }, 2000)
}

const copyOne = async (idx: number) => {
  await navigator.clipboard.writeText(result.value[idx])
  copiedKey.value = String(idx); setTimeout(() => { copiedKey.value = '' }, 2000)
}

const versionLabels: Record<UuidVersion, string> = {
  v4: 'v4 随机', v1: 'v1 时间戳', nil: 'Nil 全零',
}
const versionInfo = computed(() => ({
  v4:  { label: 'UUID v4', desc: '随机生成，最常用版本，基于 crypto.getRandomValues' },
  v1:  { label: 'UUID v1', desc: '基于时间戳 + 节点 MAC 地址，有顺序性' },
  nil: { label: 'Nil UUID', desc: '全零 UUID，特殊占位用途' },
})[version.value])
</script>

<template>
  <div class="space-y-5">
    <!-- 配置区 -->
    <div class="flex flex-wrap gap-3 items-start">
      <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
        <button v-for="v in (['v4', 'v1', 'nil'] as UuidVersion[])" :key="v"
          @click="version = v"
          :class="['px-4 py-2 text-sm font-medium transition-all border-r last:border-r-0 border-gray-200 dark:border-slate-700', version === v ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']"
        >{{ versionLabels[v] }}</button>
      </div>
      <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
        <span>数量</span>
        <input v-model.number="count" type="number" min="1" max="100"
          class="w-16 px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30" />
      </div>
    </div>

    <!-- 格式选项 -->
    <div class="flex flex-wrap gap-4 text-sm">
      <label class="flex items-center gap-1.5 text-gray-600 dark:text-slate-400 cursor-pointer select-none">
        <input type="checkbox" v-model="uppercase" class="w-4 h-4 accent-accent" /> 大写
      </label>
      <label class="flex items-center gap-1.5 text-gray-600 dark:text-slate-400 cursor-pointer select-none">
        <input type="checkbox" v-model="hyphens" class="w-4 h-4 accent-accent" /> 连字符 -
      </label>
      <label class="flex items-center gap-1.5 text-gray-600 dark:text-slate-400 cursor-pointer select-none">
        <input type="checkbox" v-model="brace" class="w-4 h-4 accent-accent" /> 花括号 {}
      </label>
    </div>

    <!-- 版本说明 -->
    <div class="px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-xs text-blue-600 dark:text-blue-400">
      <strong>{{ versionInfo.label }}：</strong>{{ versionInfo.desc }}
    </div>

    <!-- 生成按钮 -->
    <button @click="generate"
      class="w-full py-3 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white shadow-lg shadow-accent/20 transition-all">
      🎲 生成 {{ count }} 个 UUID
    </button>

    <!-- 结果 -->
    <div v-if="result.length" class="space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-gray-700 dark:text-slate-200">生成结果（{{ result.length }} 个）</span>
        <button @click="copyAll" :class="['text-xs px-3 py-1 rounded-lg border transition-all', copiedKey === 'all' ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50']">
          {{ copiedKey === 'all' ? '已复制' : '复制全部' }}
        </button>
      </div>
      <div class="space-y-1.5">
        <div v-for="(uuid, i) in result" :key="i"
          class="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 hover:border-accent/30 transition-all group">
          <span class="text-xs text-gray-400 dark:text-slate-600 font-mono w-6">{{ i + 1 }}</span>
          <code class="flex-1 text-sm font-mono text-gray-700 dark:text-slate-300 break-all">{{ uuid }}</code>
          <button @click="copyOne(i)" class="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-400 hover:text-accent-dark dark:hover:text-accent transition-all flex-shrink-0">
            {{ copiedKey === String(i) ? '已复制' : '复制' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="py-8 text-center text-gray-300 dark:text-slate-700 text-sm">
      点击按钮生成 UUID
    </div>
  </div>
</template>
