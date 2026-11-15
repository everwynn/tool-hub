<script setup lang="ts">
// ============================================================
// ColorConverter — 颜色格式转换器（HEX / RGB / HSL / HSV / CMYK）
// ============================================================

import { ref, computed, watch } from 'vue'

// ----- 颜色数学 -----
function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  return [h, Math.round(s * 100), Math.round(v * 100)]
}

function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  r /= 255; g /= 255; b /= 255
  const k = 1 - Math.max(r, g, b)
  if (k === 1) return [0, 0, 0, 100]
  return [
    Math.round((1 - r - k) / (1 - k) * 100),
    Math.round((1 - g - k) / (1 - k) * 100),
    Math.round((1 - b - k) / (1 - k) * 100),
    Math.round(k * 100),
  ]
}

// ----- 状态 -----
const hex    = ref('#6366f1')
const rgb    = ref({ r: 99, g: 102, b: 241 })
const hsl    = ref({ h: 239, s: 84, l: 67 })
const alpha  = ref(100) // 0-100
const copied = ref('')

type Source = 'hex' | 'rgb' | 'hsl' | 'picker'
const source = ref<Source>('hex')

// 派生所有格式
const derived = computed(() => {
  const { r, g, b } = rgb.value
  const [hh, ss, ll] = rgbToHsl(r, g, b)
  const [hv, sv, vv] = rgbToHsv(r, g, b)
  const [c, m, y, k] = rgbToCmyk(r, g, b)
  const a = (alpha.value / 100).toFixed(2)
  const hexVal = rgbToHex(r, g, b)
  return {
    hex: hexVal,
    hexAlpha: hexVal + Math.round(alpha.value / 100 * 255).toString(16).padStart(2, '0'),
    rgb: `rgb(${r}, ${g}, ${b})`,
    rgba: `rgba(${r}, ${g}, ${b}, ${a})`,
    hsl: `hsl(${hh}, ${ss}%, ${ll}%)`,
    hsla: `hsla(${hh}, ${ss}%, ${ll}%, ${a})`,
    hsv: `hsv(${hv}, ${sv}%, ${vv}%)`,
    cmyk: `cmyk(${c}%, ${m}%, ${y}%, ${k}%)`,
    cssVar: `--color: ${hexVal};`,
    tailwind: `[${hexVal}]`,
  }
})

// 从 hex 更新 rgb
const applyHex = (v: string) => {
  const rgb_ = hexToRgb(v)
  if (rgb_) { rgb.value = { r: rgb_[0], g: rgb_[1], b: rgb_[2] }; source.value = 'hex' }
}

// HEX 输入实时更新
const hexInput = ref(hex.value)
watch(hexInput, (v) => {
  hex.value = v
  applyHex(v)
})

// RGB 输入更新
const onRgbChange = () => {
  const { r, g, b } = rgb.value
  hex.value = rgbToHex(r, g, b)
  hexInput.value = hex.value
  const [h, s, l] = rgbToHsl(r, g, b)
  hsl.value = { h, s, l }
  source.value = 'rgb'
}

// HSL 输入更新
const onHslChange = () => {
  const [r, g, b] = hslToRgb(hsl.value.h, hsl.value.s, hsl.value.l)
  rgb.value = { r, g, b }
  hex.value = rgbToHex(r, g, b)
  hexInput.value = hex.value
  source.value = 'hsl'
}

// picker 更新
const onPickerChange = (e: Event) => {
  const v = (e.target as HTMLInputElement).value
  hexInput.value = v
  hex.value = v
  applyHex(v)
}

// 初始化 hsl
const initHsl = () => { const [h, s, l] = rgbToHsl(99, 102, 241); hsl.value = { h, s, l } }
initHsl()

// 预设颜色
const presets = [
  '#ef4444','#f97316','#eab308','#22c55e','#06b6d4',
  '#3b82f6','#6366f1','#8b5cf6','#ec4899','#64748b',
  '#000000','#ffffff',
]

const applyPreset = (c: string) => {
  hexInput.value = c
  applyHex(c)
  hex.value = c
  const [h, s, l] = rgbToHsl(rgb.value.r, rgb.value.g, rgb.value.b)
  hsl.value = { h, s, l }
}

const copy = async (val: string, key: string) => {
  await navigator.clipboard.writeText(val)
  copied.value = key
  setTimeout(() => { copied.value = '' }, 2000)
}

const colorStyle = computed(() => ({
  backgroundColor: `rgba(${rgb.value.r},${rgb.value.g},${rgb.value.b},${alpha.value / 100})`,
}))

const textContrast = computed(() => {
  const { r, g, b } = rgb.value
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.5 ? '#000000' : '#ffffff'
})

const outputFormats = computed(() => [
  { key: 'hex',     label: 'HEX',       val: derived.value.hex },
  { key: 'hexA',    label: 'HEX + Alpha', val: derived.value.hexAlpha },
  { key: 'rgb',     label: 'RGB',       val: derived.value.rgb },
  { key: 'rgba',    label: 'RGBA',      val: derived.value.rgba },
  { key: 'hsl',     label: 'HSL',       val: derived.value.hsl },
  { key: 'hsla',    label: 'HSLA',      val: derived.value.hsla },
  { key: 'hsv',     label: 'HSV',       val: derived.value.hsv },
  { key: 'cmyk',    label: 'CMYK',      val: derived.value.cmyk },
  { key: 'cssVar',  label: 'CSS 变量',   val: derived.value.cssVar },
  { key: 'tailwind',label: 'Tailwind',  val: derived.value.tailwind },
])
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 左栏：输入控制 -->
      <div class="space-y-5">
        <!-- 颜色预览 -->
        <div class="flex items-center gap-4">
          <div :style="colorStyle" class="w-20 h-20 rounded-2xl border border-white/20 shadow-lg flex-shrink-0 transition-all duration-300 flex items-center justify-center">
            <span :style="{ color: textContrast }" class="text-xs font-mono font-bold opacity-70">{{ derived.hex }}</span>
          </div>
          <div class="flex-1 space-y-1.5">
            <!-- Picker -->
            <div class="flex items-center gap-2">
              <label class="text-xs text-gray-500 dark:text-slate-500 w-14 flex-shrink-0">拾色器</label>
              <input type="color" :value="hex" @input="onPickerChange" class="w-10 h-8 rounded cursor-pointer border border-gray-200 dark:border-slate-700 p-0.5 bg-transparent" />
            </div>
            <!-- HEX 输入 -->
            <div class="flex items-center gap-2">
              <label class="text-xs text-gray-500 dark:text-slate-500 w-14 flex-shrink-0">HEX</label>
              <input v-model="hexInput" type="text" maxlength="7" class="flex-1 px-3 py-1.5 text-sm font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50" placeholder="#6366f1" />
            </div>
            <!-- Alpha -->
            <div class="flex items-center gap-2">
              <label class="text-xs text-gray-500 dark:text-slate-500 w-14 flex-shrink-0">透明度</label>
              <input type="range" v-model.number="alpha" min="0" max="100" class="flex-1 accent-accent" />
              <span class="text-xs text-gray-500 dark:text-slate-400 w-10 text-right">{{ alpha }}%</span>
            </div>
          </div>
        </div>

        <!-- RGB 滑块 -->
        <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4 space-y-3">
          <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider">RGB</h3>
          <div v-for="ch in (['r','g','b'] as const)" :key="ch" class="flex items-center gap-3">
            <span :class="['text-xs font-bold w-4 text-center uppercase', ch==='r'?'text-red-500':ch==='g'?'text-green-500':'text-blue-500']">{{ ch }}</span>
            <input type="range" v-model.number="rgb[ch]" min="0" max="255" @input="onRgbChange" :class="['flex-1', ch==='r'?'accent-red-500':ch==='g'?'accent-green-500':'accent-blue-500']" />
            <input v-model.number="rgb[ch]" type="number" min="0" max="255" @change="onRgbChange" class="w-14 px-2 py-1 text-xs font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-center text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-accent/30" />
          </div>
        </div>

        <!-- HSL 滑块 -->
        <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4 space-y-3">
          <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider">HSL</h3>
          <div class="flex items-center gap-3">
            <span class="text-xs font-bold w-4 text-center text-gray-500">H</span>
            <input type="range" v-model.number="hsl.h" min="0" max="360" @input="onHslChange" class="flex-1 accent-accent" />
            <input v-model.number="hsl.h" type="number" min="0" max="360" @change="onHslChange" class="w-14 px-2 py-1 text-xs font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-center text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-accent/30" />
          </div>
          <div v-for="(ch, label) in ({ s: 'S', l: 'L' } as const)" :key="label" class="flex items-center gap-3">
            <span class="text-xs font-bold w-4 text-center text-gray-500">{{ label }}</span>
            <input type="range" v-model.number="hsl[ch]" min="0" max="100" @input="onHslChange" class="flex-1 accent-accent" />
            <input v-model.number="hsl[ch]" type="number" min="0" max="100" @change="onHslChange" class="w-14 px-2 py-1 text-xs font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-center text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-accent/30" />
          </div>
        </div>

        <!-- 预设色板 -->
        <div>
          <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-2">预设颜色</h3>
          <div class="flex flex-wrap gap-2">
            <button v-for="c in presets" :key="c" @click="applyPreset(c)"
              :style="{ backgroundColor: c, outline: hex === c ? '2px solid #6366f1' : 'none', outlineOffset: '2px' }"
              class="w-8 h-8 rounded-lg border border-white/20 shadow-sm hover:scale-110 transition-transform"
              :title="c"
            ></button>
          </div>
        </div>
      </div>

      <!-- 右栏：输出格式 -->
      <div class="space-y-3">
        <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider">所有格式</h3>
        <div class="space-y-2">
          <div v-for="fmt in outputFormats" :key="fmt.key"
            class="flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40"
          >
            <div>
              <span class="text-xs font-medium text-gray-500 dark:text-slate-500 mr-2 w-20 inline-block">{{ fmt.label }}</span>
              <code class="text-sm font-mono text-gray-800 dark:text-slate-200">{{ fmt.val }}</code>
            </div>
            <button @click="copy(fmt.val, fmt.key)"
              :class="['text-xs px-2.5 py-1 rounded-lg border transition-all flex-shrink-0 ml-2', copied === fmt.key ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']"
            >{{ copied === fmt.key ? '✓' : '复制' }}</button>
          </div>
        </div>

        <!-- 渐变预览 -->
        <div class="mt-4">
          <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-2">渐变预览</h3>
          <div class="rounded-xl overflow-hidden h-16"
            :style="{ background: `linear-gradient(90deg, ${derived.hex} 0%, transparent 100%)` }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>
