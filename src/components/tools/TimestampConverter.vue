<script setup lang="ts">
// ============================================================
// TimestampConverter — Unix 时间戳转换工具
// ============================================================
// 功能：
// 1. 当前时间戳实时显示（秒 / 毫秒），1秒刷新
// 2. 时间戳 → 日期字符串（支持多时区）
// 3. 日期字符串 → 时间戳
// 4. 常用时区快速切换
// 5. 时间戳范围合理性检测（判断是秒还是毫秒）
// 6. 一键复制
// ============================================================

import { ref, computed, onMounted, onUnmounted } from 'vue'

// --- 当前时间实时显示 ---
const nowSec = ref(Math.floor(Date.now() / 1000))
const nowMs = ref(Date.now())
let timer: ReturnType<typeof setInterval>

onMounted(() => {
  timer = setInterval(() => {
    nowSec.value = Math.floor(Date.now() / 1000)
    nowMs.value = Date.now()
  }, 1000)
})
onUnmounted(() => clearInterval(timer))

// --- 时区列表 ---
const timezones = [
  { label: 'UTC+8 北京/上海', tz: 'Asia/Shanghai' },
  { label: 'UTC+0 伦敦',      tz: 'Europe/London' },
  { label: 'UTC-5 纽约',      tz: 'America/New_York' },
  { label: 'UTC-8 洛杉矶',    tz: 'America/Los_Angeles' },
  { label: 'UTC+9 东京',      tz: 'Asia/Tokyo' },
  { label: 'UTC+1 柏林',      tz: 'Europe/Berlin' },
  { label: 'UTC+5:30 印度',   tz: 'Asia/Kolkata' },
  { label: 'UTC+8 新加坡',    tz: 'Asia/Singapore' },
]
const selectedTz = ref('Asia/Shanghai')

// 格式化函数
const formatWithTz = (ts: number, tz: string): string => {
  return new Date(ts).toLocaleString('zh-CN', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

const formatISO = (ts: number, tz: string): string => {
  // 手动构造 ISO 格式
  try {
    const d = new Date(ts)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const get = (t: string) => parts.find(p => p.type === t)?.value || '00'
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
  } catch {
    return new Date(ts).toISOString()
  }
}

// 当前时间在各时区显示
const nowInTimezones = computed(() => {
  return timezones.map(tz => ({
    ...tz,
    time: formatWithTz(nowMs.value, tz.tz),
  }))
})

// =============== 时间戳 → 日期 ===============
const ts2dateInput = ref('')
const ts2dateUnit = ref<'auto' | 'sec' | 'ms'>('auto')

// 智能判断单位（10位=秒，13位=毫秒）
const detectUnit = (val: string): 'sec' | 'ms' => {
  const n = val.trim().length
  return n <= 10 ? 'sec' : 'ms'
}

const ts2dateResult = computed(() => {
  const raw = ts2dateInput.value.trim()
  if (!raw) return null
  const num = Number(raw)
  if (isNaN(num)) return { error: '请输入纯数字时间戳' }

  const unit = ts2dateUnit.value === 'auto' ? detectUnit(raw) : ts2dateUnit.value
  const ms = unit === 'sec' ? num * 1000 : num
  const d = new Date(ms)
  if (isNaN(d.getTime())) return { error: '时间戳无效，请检查数值' }

  return {
    unit,
    ms,
    iso: d.toISOString(),
    local: formatWithTz(ms, selectedTz.value),
    utc: formatWithTz(ms, 'UTC'),
    allZones: timezones.map(tz => ({
      ...tz,
      time: formatWithTz(ms, tz.tz),
    })),
  }
})

// =============== 日期 → 时间戳 ===============
const date2tsInput = ref('')
const date2tsTz = ref('Asia/Shanghai')

const date2tsResult = computed(() => {
  const raw = date2tsInput.value.trim()
  if (!raw) return null

  try {
    // 尝试直接 Date 解析（支持 ISO / 常见格式）
    const d = new Date(raw)
    if (!isNaN(d.getTime())) {
      return {
        sec: Math.floor(d.getTime() / 1000),
        ms: d.getTime(),
        iso: d.toISOString(),
      }
    }
    return { error: '日期格式无法识别，推荐格式：2024-01-15 08:30:00 或 ISO 8601' }
  } catch {
    return { error: '解析失败' }
  }
})

// =============== 复制 ===============
const copiedKey = ref('')
const copyVal = async (val: string, key: string) => {
  await navigator.clipboard.writeText(val)
  copiedKey.value = key
  setTimeout(() => { copiedKey.value = '' }, 1800)
}

// =============== 时间偏移计算 ===============
const baseTs = ref(Math.floor(Date.now() / 1000))
const offsetValue = ref(0)
const offsetUnit = ref<'second' | 'minute' | 'hour' | 'day'>('hour')

const offsetMultiplier = { second: 1, minute: 60, hour: 3600, day: 86400 }

const offsetResult = computed(() => {
  const result = baseTs.value + offsetValue.value * offsetMultiplier[offsetUnit.value]
  return {
    ts: result,
    date: formatWithTz(result * 1000, selectedTz.value),
  }
})

const useNowAsBase = () => { baseTs.value = nowSec.value }
</script>

<template>
  <div class="space-y-8">
    <!-- 当前时间戳（实时） -->
    <div class="p-5 rounded-xl bg-slate-900 border border-slate-700">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-accent animate-pulse inline-block"></span>
          当前时间戳（实时）
        </h3>
        <span class="text-xs text-slate-500">每秒刷新</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- 秒级 -->
        <div class="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
          <div>
            <div class="text-xs text-slate-500 mb-1">Unix 时间戳（秒）</div>
            <div class="text-xl font-mono font-bold text-accent tracking-wider">{{ nowSec }}</div>
          </div>
          <button @click="copyVal(String(nowSec), 'sec')" :class="['text-xs px-3 py-1.5 rounded-lg border transition-all', copiedKey === 'sec' ? 'border-green-500 text-green-400' : 'border-slate-600 text-slate-400 hover:border-accent/50 hover:text-accent']">
            {{ copiedKey === 'sec' ? '已复制' : '复制' }}
          </button>
        </div>
        <!-- 毫秒级 -->
        <div class="flex items-center justify-between p-3 rounded-lg bg-slate-800 border border-slate-700">
          <div>
            <div class="text-xs text-slate-500 mb-1">Unix 时间戳（毫秒）</div>
            <div class="text-xl font-mono font-bold text-purple-400 tracking-wider">{{ nowMs }}</div>
          </div>
          <button @click="copyVal(String(nowMs), 'ms')" :class="['text-xs px-3 py-1.5 rounded-lg border transition-all', copiedKey === 'ms' ? 'border-green-500 text-green-400' : 'border-slate-600 text-slate-400 hover:border-accent/50 hover:text-accent']">
            {{ copiedKey === 'ms' ? '已复制' : '复制' }}
          </button>
        </div>
      </div>
      <!-- 当前时间多时区 -->
      <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div v-for="zone in nowInTimezones" :key="zone.tz" :class="['px-3 py-2 rounded-lg border text-xs', zone.tz === 'Asia/Shanghai' ? 'border-accent/30 bg-accent/5' : 'border-slate-700 bg-slate-800/50']">
          <div class="text-slate-500 mb-0.5">{{ zone.label.split(' ')[1] || zone.label }}</div>
          <div class="font-mono text-slate-300">{{ zone.time }}</div>
        </div>
      </div>
    </div>

    <!-- 时区选择器（全局） -->
    <div class="flex items-center gap-3 flex-wrap">
      <span class="text-sm font-medium text-gray-700 dark:text-slate-300">目标时区：</span>
      <select v-model="selectedTz" class="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-accent/30">
        <option v-for="tz in timezones" :key="tz.tz" :value="tz.tz">{{ tz.label }}</option>
      </select>
    </div>

    <!-- 分栏：时间戳→日期 / 日期→时间戳 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 时间戳 → 日期 -->
      <div class="space-y-4">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-slate-200 flex items-center gap-2">
          <span class="px-2 py-0.5 rounded bg-accent/10 text-accent text-xs font-mono">ts → date</span>
          时间戳 → 日期
        </h3>
        <div class="flex gap-2">
          <input
            v-model="ts2dateInput"
            type="text"
            placeholder="输入时间戳，如 1722384000"
            class="flex-1 px-4 py-2.5 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
            spellcheck="false"
          />
          <select v-model="ts2dateUnit" class="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-accent/30">
            <option value="auto">自动</option>
            <option value="sec">秒</option>
            <option value="ms">毫秒</option>
          </select>
        </div>
        <!-- 当前时间戳快速填入 -->
        <div class="flex gap-2">
          <button @click="ts2dateInput = String(nowSec)" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">填入当前秒级</button>
          <button @click="ts2dateInput = String(nowMs)" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">填入当前毫秒</button>
        </div>

        <!-- 错误 -->
        <div v-if="ts2dateResult?.error" class="text-sm text-red-500 dark:text-red-400 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          {{ ts2dateResult.error }}
        </div>

        <!-- 结果 -->
        <div v-if="ts2dateResult && !ts2dateResult.error" class="space-y-2">
          <div class="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-600">
            <span>识别为</span>
            <span class="px-2 py-0.5 rounded bg-accent/10 text-accent font-mono">{{ ts2dateResult.unit === 'sec' ? '秒级（10位）' : '毫秒级（13位）' }}</span>
          </div>
          <div v-for="row in [
            { key: 'local', label: timezones.find(t=>t.tz===selectedTz)?.label || selectedTz, val: ts2dateResult.local },
            { key: 'utc', label: 'UTC',  val: ts2dateResult.utc },
            { key: 'iso', label: 'ISO 8601', val: ts2dateResult.iso },
          ]" :key="row.key"
            class="flex items-center justify-between px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700"
          >
            <div>
              <div class="text-xs text-gray-400 dark:text-slate-600 mb-0.5">{{ row.label }}</div>
              <div class="text-sm font-mono text-gray-900 dark:text-white">{{ row.val }}</div>
            </div>
            <button @click="copyVal(row.val, 'ts2_' + row.key)" :class="['text-xs px-2.5 py-1 rounded-lg border transition-all flex-shrink-0', copiedKey === 'ts2_' + row.key ? 'border-green-400 text-green-500' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']">
              {{ copiedKey === 'ts2_' + row.key ? '✓' : '复制' }}
            </button>
          </div>
          <!-- 所有时区 -->
          <details class="mt-2">
            <summary class="text-xs text-gray-400 dark:text-slate-600 cursor-pointer hover:text-accent transition-colors">展开所有时区对照</summary>
            <div class="mt-2 space-y-1.5">
              <div v-for="zone in ts2dateResult.allZones" :key="zone.tz" class="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-800 text-xs">
                <span class="text-gray-500 dark:text-slate-500">{{ zone.label }}</span>
                <span class="font-mono text-gray-700 dark:text-slate-300">{{ zone.time }}</span>
              </div>
            </div>
          </details>
        </div>
      </div>

      <!-- 日期 → 时间戳 -->
      <div class="space-y-4">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-slate-200 flex items-center gap-2">
          <span class="px-2 py-0.5 rounded bg-purple-500/10 text-purple-500 dark:text-purple-400 text-xs font-mono">date → ts</span>
          日期 → 时间戳
        </h3>
        <input
          v-model="date2tsInput"
          type="text"
          placeholder="如：2024-08-01 08:00:00 或 2024-08-01T08:00:00Z"
          class="w-full px-4 py-2.5 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
          spellcheck="false"
        />
        <div class="flex gap-2">
          <button @click="date2tsInput = new Date().toISOString().slice(0,19).replace('T',' ')" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">填入当前时间</button>
        </div>

        <!-- 错误 -->
        <div v-if="date2tsResult?.error" class="text-sm text-red-500 dark:text-red-400 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          {{ date2tsResult.error }}
        </div>

        <!-- 结果 -->
        <div v-if="date2tsResult && !date2tsResult.error" class="space-y-2">
          <div v-for="row in [
            { key: 'sec', label: 'Unix 时间戳（秒）',  val: String(date2tsResult.sec) },
            { key: 'ms',  label: 'Unix 时间戳（毫秒）', val: String(date2tsResult.ms) },
            { key: 'iso', label: 'ISO 8601',            val: date2tsResult.iso },
          ]" :key="row.key"
            class="flex items-center justify-between px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700"
          >
            <div>
              <div class="text-xs text-gray-400 dark:text-slate-600 mb-0.5">{{ row.label }}</div>
              <div class="text-sm font-mono text-gray-900 dark:text-white">{{ row.val }}</div>
            </div>
            <button @click="copyVal(row.val, 'd2t_' + row.key)" :class="['text-xs px-2.5 py-1 rounded-lg border transition-all flex-shrink-0', copiedKey === 'd2t_' + row.key ? 'border-green-400 text-green-500' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']">
              {{ copiedKey === 'd2t_' + row.key ? '✓' : '复制' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 时间偏移计算器 -->
    <div class="p-5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40">
      <h3 class="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">时间偏移计算</h3>
      <div class="flex flex-wrap items-center gap-3 text-sm text-gray-700 dark:text-slate-300">
        <input
          v-model.number="baseTs"
          type="text"
          placeholder="基准时间戳（秒）"
          class="w-44 px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button @click="useNowAsBase" class="text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">用当前时间</button>
        <span class="text-gray-400">±</span>
        <input v-model.number="offsetValue" type="number" class="w-20 px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30" />
        <select v-model="offsetUnit" class="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-accent/30">
          <option value="second">秒</option>
          <option value="minute">分钟</option>
          <option value="hour">小时</option>
          <option value="day">天</option>
        </select>
        <span class="text-gray-400">=</span>
        <div class="flex-1 min-w-0">
          <div class="font-mono text-accent-dark dark:text-accent font-semibold">{{ offsetResult.ts }}</div>
          <div class="text-xs text-gray-500 dark:text-slate-500 mt-0.5">{{ offsetResult.date }}</div>
        </div>
        <button @click="copyVal(String(offsetResult.ts), 'offset')" :class="['text-xs px-3 py-1.5 rounded-lg border transition-all', copiedKey === 'offset' ? 'border-green-400 text-green-500' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']">
          {{ copiedKey === 'offset' ? '✓ 已复制' : '复制结果' }}
        </button>
      </div>
    </div>
  </div>
</template>
