<script setup lang="ts">
// ============================================================
// ImageWatermark — 图片加水印
// canvas 本地绘制文字 / Logo 水印，支持拖拽定位、旋转、平铺
// ============================================================

import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'

const fileInput = ref<HTMLInputElement | null>(null)
const logoInput = ref<HTMLInputElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const file = ref<File | null>(null)
const img = ref<HTMLImageElement | null>(null)
const srcUrl = ref('')
const logoImg = ref<HTMLImageElement | null>(null)
const logoUrl = ref('')
const logoName = ref('')
const dragging = ref(false)

// 水印参数
const mode = ref<'text' | 'image'>('text')
const text = ref('© ToolHub')
const fontSizePct = ref(3)
const color = ref('#ffffff')
const opacity = ref(50)
const angle = ref(-30)
const tile = ref(false)
const gapPct = ref(22)
const logoWidthPct = ref(15)

// 位置（相对坐标，锚点为中心）
const xPct = ref(0.5)
const yPct = ref(0.5)

// 导出
const format = ref<'png' | 'jpeg' | 'webp'>('png')
const quality = ref(92)
const exporting = ref(false)

const fileSize = computed(() => file.value?.size ?? 0)

// ======================== 加载 ========================

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function cleanup() {
  if (srcUrl.value) URL.revokeObjectURL(srcUrl.value)
  if (logoUrl.value) URL.revokeObjectURL(logoUrl.value)
  srcUrl.value = ''
  logoUrl.value = ''
  img.value = null
  logoImg.value = null
  logoName.value = ''
  file.value = null
}

function loadFile(f: File) {
  if (!f.type.startsWith('image/')) return
  cleanup()
  file.value = f
  srcUrl.value = URL.createObjectURL(f)
  const image = new Image()
  image.onload = async () => {
    img.value = image
    await nextTick()
    setupView()
    render()
  }
  image.src = srcUrl.value
}

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) loadFile(f)
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) loadFile(f)
}

function loadLogo(f: File) {
  if (!f.type.startsWith('image/')) return
  if (logoUrl.value) URL.revokeObjectURL(logoUrl.value)
  logoUrl.value = URL.createObjectURL(f)
  logoName.value = f.name
  const image = new Image()
  image.onload = () => {
    logoImg.value = image
    mode.value = 'image'
    render()
  }
  image.src = logoUrl.value
}

function onLogoChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) loadLogo(f)
}

// ======================== 渲染 ========================

function setupView() {
  const image = img.value
  const c = canvasRef.value
  if (!image || !c) return
  const maxDim = 760
  const scale = Math.min(1, maxDim / image.naturalWidth, maxDim / image.naturalHeight)
  c.width = Math.round(image.naturalWidth * scale)
  c.height = Math.round(image.naturalHeight * scale)
}

function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const fontPx = (fontSizePct.value / 100) * W

  const drawOne = (cx: number, cy: number) => {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((angle.value * Math.PI) / 180)
    if (mode.value === 'text') {
      ctx.font = `600 ${fontPx}px system-ui, -apple-system, sans-serif`
      ctx.fillStyle = color.value
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text.value || '水印', 0, 0)
    } else if (logoImg.value) {
      const lw = (logoWidthPct.value / 100) * W
      const lh = lw * (logoImg.value.naturalHeight / logoImg.value.naturalWidth)
      ctx.drawImage(logoImg.value, -lw / 2, -lh / 2, lw, lh)
    }
    ctx.restore()
  }

  ctx.save()
  ctx.globalAlpha = opacity.value / 100
  if (tile.value) {
    const gap = Math.max(40, (gapPct.value / 100) * W)
    for (let y = -gap / 2; y <= H + gap; y += gap) {
      for (let x = -gap / 2; x <= W + gap; x += gap * 1.6) {
        drawOne(x, y)
      }
    }
  } else {
    drawOne(xPct.value * W, yPct.value * H)
  }
  ctx.restore()
}

function render() {
  const c = canvasRef.value
  const image = img.value
  if (!c || !image) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.drawImage(image, 0, 0, c.width, c.height)
  drawWatermark(ctx, c.width, c.height)
}

watch([mode, text, fontSizePct, color, opacity, angle, tile, gapPct, logoWidthPct, xPct, yPct], render)

// ======================== 拖拽定位 ========================

function pointerPos(e: PointerEvent) {
  const c = canvasRef.value
  if (!c) return { x: 0.5, y: 0.5 }
  const r = c.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
  }
}

function onPointerDown(e: PointerEvent) {
  if (tile.value) return
  dragging.value = true
  try {
    canvasRef.value?.setPointerCapture(e.pointerId)
  } catch {
    /* 指针已释放时忽略 */
  }
  const p = pointerPos(e)
  xPct.value = p.x
  yPct.value = p.y
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  const p = pointerPos(e)
  xPct.value = p.x
  yPct.value = p.y
}

function onPointerUp() {
  dragging.value = false
}

// 九宫格
const GRID_POSITIONS = [
  [1 / 6, 1 / 6], [0.5, 1 / 6], [5 / 6, 1 / 6],
  [1 / 6, 0.5], [0.5, 0.5], [5 / 6, 0.5],
  [1 / 6, 5 / 6], [0.5, 5 / 6], [5 / 6, 5 / 6],
]

function setPos(pos: number[]) {
  if (tile.value) return
  xPct.value = pos[0]
  yPct.value = pos[1]
}

// ======================== 导出 ========================

async function exportImage() {
  const image = img.value
  if (!image || exporting.value) return
  exporting.value = true
  try {
    const W = image.naturalWidth
    const H = image.naturalHeight
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')
    if (!ctx) return
    if (format.value === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)
    }
    ctx.drawImage(image, 0, 0, W, H)
    drawWatermark(ctx, W, H)
    const mime = format.value === 'png' ? 'image/png' : format.value === 'jpeg' ? 'image/jpeg' : 'image/webp'
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, mime, quality.value / 100))
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `watermarked.${format.value === 'jpeg' ? 'jpg' : format.value}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } finally {
    exporting.value = false
  }
}

onBeforeUnmount(cleanup)
</script>

<template>
  <div class="space-y-5">
    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />
    <input ref="logoInput" type="file" accept="image/*" class="hidden" @change="onLogoChange" />

    <!-- 上传区 -->
    <div
      v-if="!img"
      @click="fileInput?.click()"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
      :class="['flex flex-col items-center justify-center gap-3 py-20 rounded-xl border-2 border-dashed cursor-pointer transition-all', dragging
        ? 'border-accent bg-accent/5'
        : 'border-gray-300 dark:border-slate-600 hover:border-accent/60 bg-gray-50 dark:bg-slate-900/40']"
    >
      <span class="text-4xl">💧</span>
      <div class="text-center">
        <p class="text-sm font-medium text-gray-700 dark:text-slate-300">点击或拖拽图片到此处</p>
        <p class="text-xs text-gray-400 dark:text-slate-500 mt-1">支持 PNG / JPEG / WebP，图片不会上传到服务器</p>
      </div>
    </div>

    <!-- 编辑区 -->
    <template v-if="img">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-xs text-gray-500 dark:text-slate-400">
          {{ file?.name }} · {{ img.naturalWidth }}×{{ img.naturalHeight }} · {{ fmtSize(fileSize) }}
        </div>
        <button
          @click="fileInput?.click()"
          class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all"
        >更换图片</button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
        <!-- 预览画布 -->
        <div>
          <canvas
            ref="canvasRef"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            :class="['w-full block rounded-xl border border-gray-200 dark:border-slate-700 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] dark:bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:16px_16px] select-none touch-none', tile ? 'cursor-default' : 'cursor-move']"
          ></canvas>
          <p class="mt-1.5 text-xs text-gray-400 dark:text-slate-600">
            {{ tile ? '平铺模式下无需要定位，关闭平铺后可拖拽调整位置' : '在图片上拖动鼠标调整水印位置' }}
          </p>
        </div>

        <!-- 参数面板 -->
        <div class="space-y-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
          <!-- 类型 -->
          <div>
            <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">水印类型</span>
            <div class="mt-1.5 flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
              <button
                @click="mode = 'text'"
                :class="['flex-1 px-3 py-1.5 text-sm transition-colors', mode === 'text' ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:text-accent']"
              >文字水印</button>
              <button
                @click="mode = 'image'"
                :class="['flex-1 px-3 py-1.5 text-sm transition-colors', mode === 'image' ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:text-accent']"
              >Logo 水印</button>
            </div>
          </div>

          <!-- 文字参数 -->
          <template v-if="mode === 'text'">
            <label class="block">
              <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">水印文字</span>
              <input
                v-model="text"
                type="text"
                spellcheck="false"
                class="mt-1.5 w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
              />
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">颜色</span>
              <div class="mt-1.5 flex items-center gap-2">
                <input v-model="color" type="color" class="w-8 h-8 rounded cursor-pointer border border-gray-200 dark:border-slate-700" />
                <span class="text-xs font-mono text-gray-500 dark:text-slate-400">{{ color }}</span>
              </div>
            </label>
          </template>

          <!-- Logo 参数 -->
          <template v-else>
            <div>
              <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">Logo 图片</span>
              <div class="mt-1.5 flex items-center gap-2">
                <button
                  @click="logoInput?.click()"
                  class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all"
                >选择 Logo</button>
                <span class="text-xs text-gray-400 dark:text-slate-500 truncate">{{ logoName || '未选择' }}</span>
              </div>
            </div>
            <label class="block">
              <span class="flex justify-between text-xs font-semibold text-gray-500 dark:text-slate-400">
                <span>Logo 大小</span><span class="font-normal">{{ logoWidthPct }}%</span>
              </span>
              <input v-model.number="logoWidthPct" type="range" min="5" max="60" class="mt-1.5 w-full accent-accent" />
            </label>
          </template>

          <!-- 字号（文字模式） -->
          <label v-if="mode === 'text'" class="block">
            <span class="flex justify-between text-xs font-semibold text-gray-500 dark:text-slate-400">
              <span>字号（图宽百分比）</span><span class="font-normal">{{ fontSizePct }}%</span>
            </span>
            <input v-model.number="fontSizePct" type="range" min="1" max="12" step="0.5" class="mt-1.5 w-full accent-accent" />
          </label>

          <label class="block">
            <span class="flex justify-between text-xs font-semibold text-gray-500 dark:text-slate-400">
              <span>不透明度</span><span class="font-normal">{{ opacity }}%</span>
            </span>
            <input v-model.number="opacity" type="range" min="5" max="100" class="mt-1.5 w-full accent-accent" />
          </label>

          <label class="block">
            <span class="flex justify-between text-xs font-semibold text-gray-500 dark:text-slate-400">
              <span>旋转角度</span><span class="font-normal">{{ angle }}°</span>
            </span>
            <input v-model.number="angle" type="range" min="-90" max="90" class="mt-1.5 w-full accent-accent" />
          </label>

          <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 select-none cursor-pointer">
            <input type="checkbox" v-model="tile" class="accent-accent w-4 h-4" />
            平铺模式
          </label>

          <label v-if="tile" class="block">
            <span class="flex justify-between text-xs font-semibold text-gray-500 dark:text-slate-400">
              <span>平铺间距</span><span class="font-normal">{{ gapPct }}%</span>
            </span>
            <input v-model.number="gapPct" type="range" min="10" max="50" class="mt-1.5 w-full accent-accent" />
          </label>

          <!-- 九宫格 -->
          <div v-if="!tile">
            <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">快速定位</span>
            <div class="mt-1.5 grid grid-cols-3 gap-1 w-24">
              <button
                v-for="(pos, i) in GRID_POSITIONS"
                :key="i"
                @click="setPos(pos)"
                class="h-7 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-accent/60 hover:bg-accent/10 transition-all"
                :title="['左上', '上中', '右上', '左中', '居中', '右中', '左下', '下中', '右下'][i]"
              ></button>
            </div>
          </div>
        </div>
      </div>

      <!-- 导出 -->
      <div class="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-gray-500 dark:text-slate-500">输出格式</span>
          <div class="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <button
              v-for="f in (['png', 'jpeg', 'webp'] as const)"
              :key="f"
              @click="format = f"
              :class="['px-3 py-1.5 text-sm font-mono uppercase transition-colors', format === f
                ? 'bg-accent text-white'
                : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:text-accent']"
            >{{ f }}</button>
          </div>
        </div>
        <label v-if="format !== 'png'" class="flex flex-col gap-1 w-40">
          <span class="flex justify-between text-xs text-gray-500 dark:text-slate-500"><span>质量</span><span>{{ quality }}%</span></span>
          <input v-model.number="quality" type="range" min="30" max="100" class="w-full accent-accent" />
        </label>
        <button
          @click="exportImage"
          :disabled="exporting"
          class="px-5 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-all"
        >{{ exporting ? '导出中…' : '导出图片' }}</button>
      </div>
    </template>

    <!-- 说明 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
      <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-2">使用说明</h3>
      <ul class="text-xs text-gray-500 dark:text-slate-500 space-y-1 list-disc list-inside">
        <li>水印在浏览器本地通过 canvas 绘制，图片和 Logo 都不会上传；导出按原始分辨率渲染</li>
        <li>字号与 Logo 大小以图片宽度的百分比计算，预览与导出比例一致；JPEG 输出会填充白色背景</li>
        <li>单点模式可拖拽或九宫格定位；平铺模式适合版权保护类密集水印</li>
      </ul>
    </div>
  </div>
</template>
