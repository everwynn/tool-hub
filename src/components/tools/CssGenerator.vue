<script setup lang="ts">
// ============================================================
// CssGenerator — CSS 渐变/阴影生成器（双 Tab）
// ============================================================

import { ref, computed } from 'vue'

type Tab = 'gradient' | 'shadow'

const activeTab = ref<Tab>('gradient')
const copied = ref(false)

// ===== 渐变 =====
type GradientType = 'linear' | 'radial' | 'conic'
const gradType    = ref<GradientType>('linear')
const gradAngle   = ref(90)
const color1      = ref('#6366f1')
const color2      = ref('#ec4899')
const color3      = ref('')
const useColor3   = ref(false)

const gradientCss = computed(() => {
  const colors = useColor3.value && color3.value
    ? `${color1.value}, ${color2.value}, ${color3.value}`
    : `${color1.value}, ${color2.value}`
  if (gradType.value === 'linear') {
    return `linear-gradient(${gradAngle.value}deg, ${colors})`
  } else if (gradType.value === 'radial') {
    return `radial-gradient(circle, ${colors})`
  } else {
    return `conic-gradient(from ${gradAngle.value}deg, ${colors})`
  }
})

const gradientPreview = computed(() => `background: ${gradientCss.value};`)

// ===== 阴影 =====
const shadowX      = ref(0)
const shadowY      = ref(4)
const shadowBlur   = ref(6)
const shadowSpread = ref(-1)
const shadowColor  = ref('rgba(0,0,0,0.3)')
const shadowInset  = ref(false)

const shadowCss = computed(() => {
  const inset = shadowInset.value ? 'inset ' : ''
  return `${inset}${shadowX.value}px ${shadowY.value}px ${shadowBlur.value}px ${shadowSpread.value}px ${shadowColor.value}`
})

const shadowPreview = computed(() => `box-shadow: ${shadowCss.value};`)

// 预设阴影
const shadowPresets = [
  { label: '卡片',   x: 0, y: 1, blur: 3, spread: 0, color: 'rgba(0,0,0,0.2)', inset: false },
  { label: '悬浮',   x: 0, y: 4, blur: 6, spread: -1, color: 'rgba(0,0,0,0.3)', inset: false },
  { label: '深阴影', x: 0, y: 10, blur: 15, spread: -3, color: 'rgba(0,0,0,0.25)', inset: false },
  { label: '内凹',   x: 0, y: 2, blur: 4, spread: 0, color: 'rgba(0,0,0,0.15)', inset: true },
  { label: '霓虹',   x: 0, y: 0, blur: 15, spread: 2, color: 'rgba(99,102,241,0.5)', inset: false },
  { label: '长投影', x: 10, y: 10, blur: 20, spread: 0, color: 'rgba(0,0,0,0.4)', inset: false },
]

const loadPreset = (p: typeof shadowPresets[0]) => {
  shadowX.value = p.x; shadowY.value = p.y; shadowBlur.value = p.blur
  shadowSpread.value = p.spread; shadowColor.value = p.color; shadowInset.value = p.inset
}

// 渐变预设
const gradientPresets = [
  { label: '靛蓝',    c1: '#6366f1', c2: '#818cf8', angle: 90 },
  { label: '日落',    c1: '#f97316', c2: '#ef4444', angle: 135 },
  { label: '海洋',    c1: '#0ea5e9', c2: '#1e40af', angle: 180 },
  { label: '森林',    c1: '#22c55e', c2: '#15803d', angle: 135 },
  { label: '紫罗兰',  c1: '#8b5cf6', c2: '#ec4899', angle: 90 },
  { label: '极光',    c1: '#06b6d4', c2: '#8b5cf6', c2Extra: '#ec4899', angle: 120 },
]

const loadGradPreset = (p: typeof gradientPresets[0]) => {
  color1.value = p.c1; color2.value = p.c2; gradAngle.value = p.angle
  if (p.c2Extra) { color3.value = p.c2Extra; useColor3.value = true }
  else { useColor3.value = false }
}

const currentCss = computed(() => activeTab.value === 'gradient' ? gradientPreview.value : shadowPreview.value)

const copy = async () => {
  await navigator.clipboard.writeText(currentCss.value)
  copied.value = true; setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <div class="space-y-5">
    <!-- Tab 切换 -->
    <div class="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-slate-800/60 w-fit">
      <button v-for="tab in [{ key: 'gradient', label: '🎨 渐变' }, { key: 'shadow', label: '🌑 阴影' }]" :key="tab.key"
        @click="activeTab = tab.key as Tab"
        :class="['px-4 py-2 text-sm font-medium rounded-lg transition-all', activeTab === tab.key ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200']"
      >{{ tab.label }}</button>
    </div>

    <!-- ====== 渐变 Tab ====== -->
    <div v-if="activeTab === 'gradient'" class="space-y-4">
      <!-- 预览 -->
      <div class="h-32 rounded-xl border border-gray-200 dark:border-slate-700" :style="{ background: gradientCss }"></div>

      <!-- CSS 代码 -->
      <div class="flex items-center gap-2">
        <code class="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-slate-200 text-sm font-mono break-all">{{ gradientPreview }}</code>
        <button @click="copy" :class="['text-xs px-3 py-2 rounded-lg border transition-all flex-shrink-0', copied ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50']">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>

      <!-- 类型选择 -->
      <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 w-fit">
        <button v-for="t in (['linear', 'radial', 'conic'] as GradientType[])" :key="t"
          @click="gradType = t"
          :class="['px-4 py-2 text-sm font-medium transition-all border-r last:border-r-0 border-gray-200 dark:border-slate-700', gradType === t ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']"
        >{{ t === 'linear' ? '线性' : t === 'radial' ? '径向' : '锥形' }}</button>
      </div>

      <!-- 角度滑块 -->
      <div v-if="gradType !== 'radial'">
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm font-medium text-gray-600 dark:text-slate-400">角度</label>
          <span class="text-sm font-mono font-bold text-accent-dark dark:text-accent">{{ gradAngle }}°</span>
        </div>
        <input v-model.number="gradAngle" type="range" min="0" max="360" step="1" class="w-full accent-accent" />
      </div>

      <!-- 颜色 -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">颜色 1</label>
          <div class="flex gap-2">
            <input v-model="color1" type="color" class="w-12 h-9 rounded-lg border border-gray-200 dark:border-slate-700 cursor-pointer" />
            <input v-model="color1" type="text" class="flex-1 px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">颜色 2</label>
          <div class="flex gap-2">
            <input v-model="color2" type="color" class="w-12 h-9 rounded-lg border border-gray-200 dark:border-slate-700 cursor-pointer" />
            <input v-model="color2" type="text" class="flex-1 px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white" />
          </div>
        </div>
      </div>

      <!-- 第三色 -->
      <div class="space-y-2">
        <label class="flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-400 cursor-pointer select-none">
          <input type="checkbox" v-model="useColor3" class="w-4 h-4 accent-accent" /> 使用第三种颜色
        </label>
        <div v-if="useColor3">
          <div class="flex gap-2">
            <input v-model="color3" type="color" class="w-12 h-9 rounded-lg border border-gray-200 dark:border-slate-700 cursor-pointer" />
            <input v-model="color3" type="text" class="flex-1 px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white" />
          </div>
        </div>
      </div>

      <!-- 预设 -->
      <div class="space-y-2">
        <h3 class="text-xs font-semibold text-gray-500 dark:text-slate-500">渐变预设</h3>
        <div class="flex flex-wrap gap-2">
          <button v-for="p in gradientPresets" :key="p.label" @click="loadGradPreset(p)"
            class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-xs text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent-dark dark:hover:text-accent transition-all flex items-center gap-2"
          >
            <span class="w-4 h-4 rounded-full" :style="{ background: `linear-gradient(${p.angle}deg, ${p.c1}, ${p.c2})` }"></span>
            {{ p.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- ====== 阴影 Tab ====== -->
    <div v-else class="space-y-4">
      <!-- 预览 -->
      <div class="flex items-center justify-center h-32 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40">
        <div class="w-24 h-24 rounded-xl bg-white dark:bg-slate-700" :style="{ boxShadow: shadowCss }"></div>
      </div>

      <!-- CSS 代码 -->
      <div class="flex items-center gap-2">
        <code class="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-slate-200 text-sm font-mono break-all">{{ shadowPreview }}</code>
        <button @click="copy" :class="['text-xs px-3 py-2 rounded-lg border transition-all flex-shrink-0', copied ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50']">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>

      <!-- 参数滑块 -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium text-gray-600 dark:text-slate-400">X 偏移</label>
            <span class="text-sm font-mono font-bold text-accent-dark dark:text-accent">{{ shadowX }}px</span>
          </div>
          <input v-model.number="shadowX" type="range" min="-50" max="50" step="1" class="w-full accent-accent" />
        </div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium text-gray-600 dark:text-slate-400">Y 偏移</label>
            <span class="text-sm font-mono font-bold text-accent-dark dark:text-accent">{{ shadowY }}px</span>
          </div>
          <input v-model.number="shadowY" type="range" min="-50" max="50" step="1" class="w-full accent-accent" />
        </div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium text-gray-600 dark:text-slate-400">模糊半径</label>
            <span class="text-sm font-mono font-bold text-accent-dark dark:text-accent">{{ shadowBlur }}px</span>
          </div>
          <input v-model.number="shadowBlur" type="range" min="0" max="100" step="1" class="w-full accent-accent" />
        </div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium text-gray-600 dark:text-slate-400">扩散</label>
            <span class="text-sm font-mono font-bold text-accent-dark dark:text-accent">{{ shadowSpread }}px</span>
          </div>
          <input v-model.number="shadowSpread" type="range" min="-50" max="50" step="1" class="w-full accent-accent" />
        </div>
      </div>

      <!-- 颜色 + inset -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">阴影颜色</label>
          <input v-model="shadowColor" type="text" class="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">内阴影</label>
          <label class="flex items-center h-9 gap-2 cursor-pointer select-none">
            <input type="checkbox" v-model="shadowInset" class="w-4 h-4 accent-accent" />
            <span class="text-sm text-gray-600 dark:text-slate-400">inset</span>
          </label>
        </div>
      </div>

      <!-- 预设 -->
      <div class="space-y-2">
        <h3 class="text-xs font-semibold text-gray-500 dark:text-slate-500">阴影预设</h3>
        <div class="flex flex-wrap gap-2">
          <button v-for="p in shadowPresets" :key="p.label" @click="loadPreset(p)"
            class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-xs text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent-dark dark:hover:text-accent transition-all"
          >{{ p.label }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
