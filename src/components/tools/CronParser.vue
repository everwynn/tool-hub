<script setup lang="ts">
// ============================================================
// CronParser — Cron 表达式生成器 & 解析器
// ============================================================
// 功能：
// 1. 可视化面板 → 生成 Cron 表达式（5字段标准格式）
// 2. 手动输入表达式 → 实时解析含义
// 3. 预览下次 N 次执行时间
// 4. 常用预设快速选择
// ============================================================

import { ref, computed, watch } from 'vue'

// --- 字段定义 ---
interface CronField {
  key: 'minute' | 'hour' | 'day' | 'month' | 'weekday'
  label: string
  unit: string
  min: number
  max: number
  names?: string[]
}

const fields: CronField[] = [
  { key: 'minute',  label: '分钟', unit: '分',  min: 0,  max: 59 },
  { key: 'hour',    label: '小时', unit: '时',  min: 0,  max: 23 },
  { key: 'day',     label: '日期', unit: '日',  min: 1,  max: 31 },
  { key: 'month',   label: '月份', unit: '月',  min: 1,  max: 12, names: ['','1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'] },
  { key: 'weekday', label: '星期', unit: '天',  min: 0,  max: 6,  names: ['周日','周一','周二','周三','周四','周五','周六'] },
]

type FieldType = 'any' | 'specific' | 'every' | 'range'

interface FieldConfig {
  type: FieldType
  specific: number[]
  everyN: number
  rangeFrom: number
  rangeTo: number
}

const createDefault = (): FieldConfig => ({
  type: 'any', specific: [], everyN: 1, rangeFrom: 0, rangeTo: 0,
})

const config = ref<Record<string, FieldConfig>>({
  minute:  { ...createDefault(), type: 'every', everyN: 5 },
  hour:    { ...createDefault() },
  day:     { ...createDefault() },
  month:   { ...createDefault() },
  weekday: { ...createDefault() },
})

// 手动输入模式
const manualMode = ref(false)
const manualInput = ref('')

// --- 字段 → Cron 片段 ---
const fieldToExpr = (cfg: FieldConfig, field: CronField): string => {
  switch (cfg.type) {
    case 'any': return '*'
    case 'specific':
      return cfg.specific.length ? cfg.specific.sort((a,b)=>a-b).join(',') : '*'
    case 'every':
      return cfg.everyN <= 1 ? '*' : `*/${cfg.everyN}`
    case 'range':
      return `${cfg.rangeFrom}-${cfg.rangeTo}`
    default: return '*'
  }
}

// --- 生成完整 Cron 表达式 ---
const cronExpr = computed(() => {
  if (manualMode.value) return manualInput.value.trim()
  return fields.map(f => fieldToExpr(config.value[f.key], f)).join(' ')
})

// --- 预设 ---
const presets = [
  { label: '每分钟',         expr: '* * * * *' },
  { label: '每5分钟',        expr: '*/5 * * * *' },
  { label: '每15分钟',       expr: '*/15 * * * *' },
  { label: '每30分钟',       expr: '*/30 * * * *' },
  { label: '每小时整点',     expr: '0 * * * *' },
  { label: '每天凌晨0点',    expr: '0 0 * * *' },
  { label: '每天早上8点',    expr: '0 8 * * *' },
  { label: '每周一早上9点',  expr: '0 9 * * 1' },
  { label: '每月1号凌晨',    expr: '0 0 1 * *' },
  { label: '每年1月1日',     expr: '0 0 1 1 *' },
]

const applyPreset = (expr: string) => {
  manualInput.value = expr
  manualMode.value = true
}

// --- 解析 Cron 表达式为人类可读描述 ---
const parseDesc = (expr: string): string => {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return '表达式格式错误（需要 5 个字段）'

  const [min, hour, day, month, weekday] = parts

  const descPart = (val: string, unit: string, names?: string[]) => {
    if (val === '*') return null
    if (val.startsWith('*/')) return `每 ${val.slice(2)} ${unit}`
    if (val.includes('-')) {
      const [a, b] = val.split('-')
      const na = names ? (names[parseInt(a)] || a) : a
      const nb = names ? (names[parseInt(b)] || b) : b
      return `${na} 到 ${nb}`
    }
    if (val.includes(',')) {
      const parts = val.split(',').map(v => names ? (names[parseInt(v)] || v) : v)
      return parts.join('、')
    }
    return names ? (names[parseInt(val)] || val) : val
  }

  const monthNames = ['','1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
  const wdNames = ['周日','周一','周二','周三','周四','周五','周六']

  const parts2: string[] = []

  const wdDesc = descPart(weekday, '天', wdNames)
  const dayDesc = descPart(day, '日', undefined)
  const monthDesc = descPart(month, '月', monthNames)
  const hourDesc = descPart(hour, '时', undefined)
  const minDesc = descPart(min, '分', undefined)

  if (monthDesc) parts2.push(monthDesc)
  if (wdDesc && dayDesc) parts2.push(`每 ${wdDesc} 或 ${dayDesc} 日`)
  else if (wdDesc) parts2.push(`每 ${wdDesc}`)
  else if (dayDesc) parts2.push(`每月 ${dayDesc} 日`)

  // 时间描述
  if (hour === '*' && min === '*') {
    parts2.push('每分钟')
  } else if (hour === '*' && min.startsWith('*/')) {
    parts2.push(`每 ${min.slice(2)} 分钟`)
  } else if (min === '0' && hour.startsWith('*/')) {
    parts2.push(`每 ${hour.slice(2)} 小时整点`)
  } else {
    if (hourDesc) parts2.push(`${hourDesc} 时`)
    if (minDesc) parts2.push(`${minDesc} 分`)
    else if (hour !== '*') parts2.push('整点')
  }

  return parts2.length ? '执行于：' + parts2.join(' · ') : '每分钟执行'
}

const description = computed(() => parseDesc(cronExpr.value))

// --- 下次执行时间预览（纯 JS 计算，不依赖外部库）---
const nextTimes = computed(() => {
  const expr = cronExpr.value.trim()
  const parts = expr.split(/\s+/)
  if (parts.length !== 5) return []

  const [minExpr, hourExpr, dayExpr, monthExpr, wdExpr] = parts

  const matchField = (expr: string, val: number): boolean => {
    if (expr === '*') return true
    if (expr.startsWith('*/')) {
      const n = parseInt(expr.slice(2))
      return val % n === 0
    }
    if (expr.includes('-')) {
      const [a, b] = expr.split('-').map(Number)
      return val >= a && val <= b
    }
    if (expr.includes(',')) {
      return expr.split(',').map(Number).includes(val)
    }
    return parseInt(expr) === val
  }

  const results: string[] = []
  const now = new Date()
  // 从下一分钟开始找
  now.setSeconds(0, 0)
  now.setMinutes(now.getMinutes() + 1)

  let iter = new Date(now)
  let found = 0
  const maxIter = 60 * 24 * 366 // 最多找一年

  for (let i = 0; i < maxIter && found < 8; i++) {
    const min = iter.getMinutes()
    const hour = iter.getHours()
    const day = iter.getDate()
    const month = iter.getMonth() + 1
    const wd = iter.getDay()

    if (
      matchField(monthExpr, month) &&
      matchField(dayExpr, day) &&
      matchField(wdExpr, wd) &&
      matchField(hourExpr, hour) &&
      matchField(minExpr, min)
    ) {
      results.push(iter.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }))
      found++
    }

    iter.setMinutes(iter.getMinutes() + 1)
  }

  return results
})

const toggleMode = () => {
  if (!manualMode.value) {
    manualInput.value = cronExpr.value
  }
  manualMode.value = !manualMode.value
}

const copied = ref(false)
const copy = async () => {
  await navigator.clipboard.writeText(cronExpr.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

// 切换特定值的选中状态
const toggleSpecific = (fieldKey: string, val: number) => {
  const arr = config.value[fieldKey].specific
  const idx = arr.indexOf(val)
  if (idx === -1) arr.push(val)
  else arr.splice(idx, 1)
}
</script>

<template>
  <div class="space-y-6">
    <!-- 表达式显示 + 复制 -->
    <div class="flex items-center gap-3 p-4 rounded-xl bg-slate-900 border border-slate-700">
      <code class="flex-1 text-lg font-mono text-accent tracking-widest">{{ cronExpr || '* * * * *' }}</code>
      <button @click="toggleMode" class="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:border-accent/50 hover:text-accent transition-all flex-shrink-0">
        {{ manualMode ? '切换为可视化' : '手动编辑' }}
      </button>
      <button @click="copy" :class="['text-xs px-3 py-1.5 rounded-lg border transition-all flex-shrink-0', copied ? 'border-green-500 text-green-400' : 'border-slate-600 text-slate-400 hover:border-accent/50 hover:text-accent']">
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>

    <!-- 描述 -->
    <div class="text-sm text-gray-600 dark:text-slate-400 px-1">{{ description }}</div>

    <!-- 手动输入 -->
    <div v-if="manualMode">
      <label class="block text-sm font-semibold text-gray-700 dark:text-slate-200 mb-2">手动输入 Cron 表达式</label>
      <input
        v-model="manualInput"
        type="text"
        placeholder="* * * * *"
        class="w-full px-4 py-3 text-base font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all tracking-widest"
        spellcheck="false"
      />
      <p class="mt-2 text-xs text-gray-400 dark:text-slate-600">格式：分钟(0-59) 小时(0-23) 日(1-31) 月(1-12) 星期(0-6，0=周日)</p>
    </div>

    <!-- 可视化配置面板 -->
    <div v-else class="space-y-4">
      <div v-for="field in fields" :key="field.key" class="p-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-semibold text-gray-700 dark:text-slate-200">{{ field.label }}</span>
          <code class="text-xs px-2 py-1 rounded bg-accent/10 text-accent-dark dark:text-accent font-mono">
            {{ fieldToExpr(config[field.key], field) }}
          </code>
        </div>

        <!-- 类型选择 -->
        <div class="flex flex-wrap gap-2 mb-3">
          <button v-for="t in (['any','specific','every','range'] as FieldType[])" :key="t"
            @click="config[field.key].type = t"
            :class="[
              'px-3 py-1 text-xs rounded-lg border transition-all',
              config[field.key].type === t
                ? 'bg-accent text-white border-accent'
                : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/40'
            ]"
          >
            {{ t === 'any' ? '任意(*)' : t === 'specific' ? '指定值' : t === 'every' ? '每隔N' : '范围' }}
          </button>
        </div>

        <!-- 每隔N -->
        <div v-if="config[field.key].type === 'every'" class="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
          <span>每隔</span>
          <input
            v-model.number="config[field.key].everyN"
            type="number" :min="1" :max="field.max"
            class="w-16 px-2 py-1 text-center rounded border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-accent/50 text-sm"
          />
          <span>{{ field.unit }}</span>
        </div>

        <!-- 范围 -->
        <div v-if="config[field.key].type === 'range'" class="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
          <span>从</span>
          <input v-model.number="config[field.key].rangeFrom" type="number" :min="field.min" :max="field.max" class="w-16 px-2 py-1 text-center rounded border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-accent/50 text-sm"/>
          <span>到</span>
          <input v-model.number="config[field.key].rangeTo" type="number" :min="field.min" :max="field.max" class="w-16 px-2 py-1 text-center rounded border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-accent/50 text-sm"/>
        </div>

        <!-- 指定值 -->
        <div v-if="config[field.key].type === 'specific'" class="flex flex-wrap gap-1.5 mt-1">
          <button
            v-for="n in (field.max - field.min + 1)" :key="n"
            @click="toggleSpecific(field.key, n - 1 + field.min)"
            :class="[
              'w-9 h-9 text-xs rounded-lg border transition-all font-mono',
              config[field.key].specific.includes(n - 1 + field.min)
                ? 'bg-accent text-white border-accent'
                : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40 bg-white dark:bg-slate-900/50'
            ]"
          >
            {{ field.names ? (field.names[n - 1 + field.min] || n - 1 + field.min) : n - 1 + field.min }}
          </button>
        </div>
      </div>
    </div>

    <!-- 预设 -->
    <div>
      <h3 class="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-3">常用预设</h3>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="p in presets"
          :key="p.expr"
          @click="applyPreset(p.expr)"
          class="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent bg-white dark:bg-slate-900/40 transition-all"
        >
          {{ p.label }}
        </button>
      </div>
    </div>

    <!-- 下次执行时间 -->
    <div v-if="nextTimes.length > 0">
      <h3 class="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-3">下次执行时间（最近 8 次）</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div
          v-for="(t, idx) in nextTimes"
          :key="idx"
          :class="[
            'px-3 py-2 rounded-lg border text-xs font-mono',
            idx === 0
              ? 'bg-accent/10 border-accent/30 text-accent-dark dark:text-accent'
              : 'bg-gray-50 dark:bg-slate-900/40 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400'
          ]"
        >
          <span v-if="idx === 0" class="text-accent font-semibold mr-1">下次</span>{{ t }}
        </div>
      </div>
    </div>

    <div v-else-if="cronExpr" class="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
      ⚠ 未能在一年内找到匹配的执行时间，请检查表达式是否合理
    </div>
  </div>
</template>
