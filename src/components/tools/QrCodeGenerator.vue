<script setup lang="ts">
// ============================================================
// QrCodeGenerator — 二维码生成器（qrcode 库 + Logo 叠加）
// ============================================================

import { ref, computed, watch, onMounted } from 'vue'
import QRCode from 'qrcode'

type ErrorLevel = 'L' | 'M' | 'Q' | 'H'

const input        = ref('')
const errorLevel   = ref<ErrorLevel>('M')
const moduleSize   = ref(4)
const margin       = ref(2)
const fgColor      = ref('#000000')
const bgColor     = ref('#ffffff')
const dataUrl      = ref('')
const errorMsg    = ref('')
const copied      = ref(false)

// ===== Logo 相关 =====
const logoSrc      = ref('')        // logo data URL（预览用）
const logoImg      = ref<HTMLImageElement | null>(null)
const logoSize     = ref(20)        // logo 占 QR 码宽度的百分比
const logoRounded  = ref(true)     // logo 圆角

const errorLevelInfo: Record<ErrorLevel, { label: string; desc: string }> = {
  L: { label: 'L (7%)', desc: '可恢复约 7% 数据丢失' },
  M: { label: 'M (15%)', desc: '可恢复约 15% 数据丢失' },
  Q: { label: 'Q (25%)', desc: '可恢复约 25% 数据丢失' },
  H: { label: 'H (30%)', desc: '可恢复约 30% 数据丢失，加 Logo 推荐使用' },
}

// 计算 QR 码像素宽度
const qrWidth = computed(() => {
  const base = input.value.length < 50 ? 256 : input.value.length < 200 ? 320 : 384
  return Math.round(base * (moduleSize.value / 4))
})

async function generate() {
  if (!input.value.trim()) { dataUrl.value = ''; return }
  errorMsg.value = ''
  try {
    const opts = {
      errorCorrectionLevel: errorLevel.value,
      width: qrWidth.value,
      margin: margin.value,
      color: { dark: fgColor.value, light: bgColor.value },
    }

    if (logoImg.value) {
      // 有 Logo：先生成到 canvas，再叠加 logo
      const canvas = document.createElement('canvas')
      await QRCode.toCanvas(canvas, input.value, opts)
      const ctx = canvas.getContext('2d')!
      const logoW = canvas.width * (logoSize.value / 100)
      const logoH = logoImg.value.height * (logoW / logoImg.value.width)
      const x = (canvas.width - logoW) / 2
      const y = (canvas.height - logoH) / 2

      // 白色底（提高可扫描性）
      const pad = logoW * 0.08
      ctx.fillStyle = bgColor.value
      if (logoRounded.value) {
        roundRect(ctx, x - pad, y - pad, logoW + pad * 2, logoH + pad * 2, 12)
        ctx.fill()
      } else {
        ctx.fillRect(x - pad, y - pad, logoW + pad * 2, logoH + pad * 2)
      }

      // 画 Logo
      if (logoRounded.value) {
        ctx.save()
        roundRect(ctx, x, y, logoW, logoH, 8)
        ctx.clip()
        ctx.drawImage(logoImg.value, x, y, logoW, logoH)
        ctx.restore()
      } else {
        ctx.drawImage(logoImg.value, x, y, logoW, logoH)
      }

      dataUrl.value = canvas.toDataURL('image/png')
    } else {
      // 无 Logo：直接生成 data URL
      dataUrl.value = await QRCode.toDataURL(input.value, opts)
    }
  } catch (e) {
    errorMsg.value = `生成失败：${e instanceof Error ? e.message : String(e)}`
    dataUrl.value = ''
  }
}

// 圆角矩形辅助函数
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

watch([input, errorLevel, moduleSize, margin, fgColor, bgColor, logoSize, logoRounded], generate, { immediate: false })

// Logo 上传
const handleLogoUpload = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    errorMsg.value = '请上传图片文件'
    return
  }
  const reader = new FileReader()
  reader.onload = (ev) => {
    const src = ev.target?.result as string
    logoSrc.value = src
    const img = new Image()
    img.onload = () => {
      logoImg.value = img
      // 自动切到 H 级纠错
      if (errorLevel.value !== 'H') {
        errorLevel.value = 'H'
      }
      generate()
    }
    img.src = src
  }
  reader.readAsDataURL(file)
}

const removeLogo = () => {
  logoImg.value = null
  logoSrc.value = ''
  generate()
}

const download = (format: 'png' | 'svg') => {
  if (!dataUrl.value) return
  if (format === 'png') {
    const a = document.createElement('a')
    a.href = dataUrl.value
    a.download = `qr-code-${Date.now()}.png`
    a.click()
  } else {
    if (logoImg.value) {
      errorMsg.value = '带 Logo 的二维码仅支持 PNG 下载，不支持 SVG'
      setTimeout(() => { errorMsg.value = '' }, 3000)
      return
    }
    QRCode.toString(input.value, {
      errorCorrectionLevel: errorLevel.value,
      margin: margin.value,
      color: { dark: fgColor.value, light: bgColor.value },
      type: 'svg',
    }).then(svg => {
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qr-code-${Date.now()}.svg`
      a.click()
      URL.revokeObjectURL(url)
    })
  }
}

const copyImage = async () => {
  if (!dataUrl.value) return
  try {
    const resp = await fetch(dataUrl.value)
    const blob = await resp.blob()
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    copied.value = true; setTimeout(() => { copied.value = false }, 2000)
  } catch {
    await navigator.clipboard.writeText(input.value)
    copied.value = true; setTimeout(() => { copied.value = false }, 2000)
  }
}

const presets = [
  { label: 'URL', val: 'https://example.com' },
  { label: 'Email', val: 'mailto:contact@example.com' },
  { label: '电话', val: 'tel:+8613800138000' },
  { label: 'WiFi', val: 'WIFI:T:WPA;S:MyWiFi;P:password123;;' },
  { label: '名片', val: 'BEGIN:VCARD\nFN:张三\nTEL:13800138000\nEMAIL:zhangsan@example.com\nEND:VCARD' },
]

const byteLength = computed(() => {
  if (typeof TextEncoder === 'undefined') return 0
  return new TextEncoder().encode(input.value).length
})

const loadPreset = (p: typeof presets[0]) => { input.value = p.val }

onMounted(() => {
  if (input.value) generate()
})
</script>

<template>
  <div class="space-y-5">
    <!-- 输入 -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-medium text-gray-600 dark:text-slate-400">输入内容</span>
        <span class="text-xs text-gray-400 dark:text-slate-600">{{ input.length }} 字符 · {{ byteLength }} 字节</span>
      </div>
      <textarea v-model="input" rows="4" placeholder="输入要生成二维码的文本、URL、WiFi 密码等..."
        class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none"
        spellcheck="false"></textarea>
    </div>

    <!-- 预设 -->
    <div class="flex flex-wrap gap-2">
      <button v-for="p in presets" :key="p.label" @click="loadPreset(p)"
        class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent-dark dark:hover:text-accent transition-all"
      >{{ p.label }}</button>
    </div>

    <!-- 参数配置 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div>
        <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">纠错级别</label>
        <select v-model="errorLevel"
          class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30">
          <option v-for="lv in (['L', 'M', 'Q', 'H'] as ErrorLevel[])" :key="lv" :value="lv">{{ errorLevelInfo[lv].label }}</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">模块大小：{{ moduleSize }}px</label>
        <input v-model.number="moduleSize" type="range" min="2" max="10" step="1" class="w-full accent-accent" />
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">边距：{{ margin }} 模块</label>
        <input v-model.number="margin" type="range" min="0" max="8" step="1" class="w-full accent-accent" />
      </div>
      <div class="flex gap-2">
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">前景色</label>
          <input v-model="fgColor" type="color" class="w-full h-9 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 cursor-pointer" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">背景色</label>
          <input v-model="bgColor" type="color" class="w-full h-9 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 cursor-pointer" />
        </div>
      </div>
    </div>

    <!-- Logo 上传区 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-gray-700 dark:text-slate-200">中心 Logo（可选）</span>
        <button v-if="logoSrc" @click="removeLogo" class="text-xs px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">移除 Logo</button>
      </div>

      <div v-if="!logoSrc" class="flex items-center justify-center gap-3 px-4 py-6 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900/30 hover:border-accent/50 cursor-pointer transition-colors">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="file" accept="image/*" class="sr-only" @change="handleLogoUpload" />
          <svg class="w-6 h-6 text-gray-400 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          <div>
            <div class="text-sm text-gray-600 dark:text-slate-400">点击上传 Logo 图片</div>
            <div class="text-xs text-gray-400 dark:text-slate-600">PNG/JPG/SVG，建议正方形，透明背景最佳</div>
          </div>
        </label>
      </div>

      <!-- Logo 预览 + 大小控制 -->
      <div v-else class="flex items-center gap-4">
        <div class="w-16 h-16 rounded-lg border border-gray-200 dark:border-slate-700 bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
          <img :src="logoSrc" alt="Logo" class="max-w-full max-h-full object-contain" />
        </div>
        <div class="flex-1 space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-xs font-medium text-gray-600 dark:text-slate-400">Logo 大小</label>
            <span class="text-xs font-mono font-bold text-accent-dark dark:text-accent">{{ logoSize }}%</span>
          </div>
          <input v-model.number="logoSize" type="range" min="10" max="35" step="1" class="w-full accent-accent" />
          <label class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400 cursor-pointer select-none">
            <input type="checkbox" v-model="logoRounded" class="w-3.5 h-3.5 accent-accent" /> 圆角 Logo
          </label>
        </div>
      </div>

      <!-- Logo 提示 -->
      <div v-if="logoSrc && errorLevel !== 'H'" class="text-xs text-amber-500 dark:text-amber-400 flex items-center gap-1.5">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        建议将纠错级别设为 <strong>H (30%)</strong>，以保证 Logo 遮挡后仍可扫描
      </div>
    </div>

    <!-- 纠错说明 -->
    <div class="px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-xs text-blue-600 dark:text-blue-400">
      <strong>{{ errorLevelInfo[errorLevel].label }}：</strong>{{ errorLevelInfo[errorLevel].desc }}
    </div>

    <!-- 错误 -->
    <div v-if="errorMsg" class="text-xs text-red-500 dark:text-red-400 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
      {{ errorMsg }}
    </div>

    <!-- 预览 -->
    <div v-if="dataUrl" class="flex flex-col items-center gap-4">
      <div class="p-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40">
        <img :src="dataUrl" alt="QR Code" class="w-64 h-64" />
      </div>
      <div class="flex gap-2">
        <button @click="download('png')" class="text-xs px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-dark transition-all">下载 PNG</button>
        <button @click="download('svg')" :disabled="!!logoImg" :class="['text-xs px-4 py-2 rounded-lg border transition-all', logoImg ? 'border-gray-200 dark:border-slate-700 text-gray-300 dark:text-slate-700 cursor-not-allowed' : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/50']">
          下载 SVG
        </button>
        <button @click="copyImage" :class="['text-xs px-4 py-2 rounded-lg border transition-all', copied ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/50']">
          {{ copied ? '已复制' : '复制图片' }}
        </button>
      </div>
      <p v-if="logoImg" class="text-xs text-gray-400 dark:text-slate-600">带 Logo 的二维码仅支持 PNG 格式</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!input.trim()" class="py-12 text-center text-gray-300 dark:text-slate-700 text-sm">
      输入内容后自动生成二维码
    </div>
  </div>
</template>
