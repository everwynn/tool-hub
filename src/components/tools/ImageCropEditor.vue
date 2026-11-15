<script setup lang="ts">
// ============================================================
// ImageCropEditor — 图片裁剪旋转
// 90° 旋转 / 翻转 + 画布内自由框选，支持固定宽高比与像素级导出
// ============================================================

import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'

const fileInput = ref<HTMLInputElement | null>(null)
const viewCanvas = ref<HTMLCanvasElement | null>(null)

const file = ref<File | null>(null)
const img = ref<HTMLImageElement | null>(null)
const work = ref<HTMLCanvasElement | null>(null)
const srcUrl = ref('')
const dragging = ref(false)

const rotation = ref(0)
const flipH = ref(false)
const flipV = ref(false)

const ASPECTS = [
  { key: 'free', label: '自由', ratio: 0 },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
  { key: '3:4', label: '3:4', ratio: 3 / 4 },
  { key: '9:16', label: '9:16', ratio: 9 / 16 },
] as const
const aspect = ref<string>('free')

// 选区（预览坐标）
const sel = ref({ x: 0, y: 0, w: 0, h: 0 })
const cursor = ref('crosshair')

const format = ref<'png' | 'jpeg' | 'webp'>('png')
const quality = ref(92)
const exporting = ref(false)

const fileSize = computed(() => file.value?.size ?? 0)

const outputSize = computed(() => {
  const w = work.value
  const c = viewCanvas.value
  if (!w || !c || !c.width) return { w: 0, h: 0 }
  const scale = w.width / c.width
  return { w: Math.round(sel.value.w * scale), h: Math.round(sel.value.h * scale) }
})

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function ratioOf(): number {
  return ASPECTS.find((a) => a.key === aspect.value)?.ratio ?? 0
}

// ======================== 加载与变换 ========================

function loadFile(f: File) {
  if (!f.type.startsWith('image/')) return
  if (srcUrl.value) URL.revokeObjectURL(srcUrl.value)
  file.value = f
  srcUrl.value = URL.createObjectURL(f)
  const image = new Image()
  image.onload = async () => {
    img.value = image
    rotation.value = 0
    flipH.value = false
    flipV.value = false
    aspect.value = 'free'
    await nextTick()
    rebuildWork()
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

/** 按当前旋转 / 翻转重建工作画布（原始分辨率） */
function rebuildWork() {
  const image = img.value
  if (!image) return
  const W = image.naturalWidth
  const H = image.naturalHeight
  const rot = ((rotation.value % 360) + 360) % 360
  const swap = rot === 90 || rot === 270
  const w = swap ? H : W
  const h = swap ? W : H
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.translate(w / 2, h / 2)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.scale(flipH.value ? -1 : 1, flipV.value ? -1 : 1)
  ctx.drawImage(image, -W / 2, -H / 2)
  work.value = c
  setupView()
  resetSelection()
}

function setupView() {
  const c = viewCanvas.value
  const w = work.value
  if (!c || !w) return
  const maxDim = 760
  const scale = Math.min(1, maxDim / w.width, maxDim / w.height)
  c.width = Math.round(w.width * scale)
  c.height = Math.round(w.height * scale)
}

/** 选区重置为居中最大内接矩形（遵守当前宽高比） */
function resetSelection() {
  const c = viewCanvas.value
  if (!c) return
  const m = 0.08
  const availW = c.width * (1 - 2 * m)
  const availH = c.height * (1 - 2 * m)
  const ratio = ratioOf()
  let w = availW
  let h = ratio ? w / ratio : availH
  if (h > availH) {
    h = availH
    w = ratio ? h * ratio : availW
  }
  sel.value = { x: (c.width - w) / 2, y: (c.height - h) / 2, w, h }
  render()
}

watch(aspect, () => {
  if (!work.value) return
  if (aspect.value === 'free') {
    render()
  } else {
    resetSelection()
  }
})

// ======================== 渲染 ========================

function render() {
  const c = viewCanvas.value
  const w = work.value
  if (!c || !w) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.drawImage(w, 0, 0, c.width, c.height)

  const s = sel.value
  // 选区外遮罩
  ctx.save()
  ctx.fillStyle = 'rgba(15, 23, 42, 0.62)'
  ctx.beginPath()
  ctx.rect(0, 0, c.width, c.height)
  ctx.rect(s.x, s.y, s.w, s.h)
  ctx.fill('evenodd')
  ctx.restore()

  // 三分参考线
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 1; i <= 2; i++) {
    const gx = s.x + (s.w * i) / 3
    const gy = s.y + (s.h * i) / 3
    ctx.moveTo(gx, s.y)
    ctx.lineTo(gx, s.y + s.h)
    ctx.moveTo(s.x, gy)
    ctx.lineTo(s.x + s.w, gy)
  }
  ctx.stroke()

  // 边框与四角手柄
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2)
  ctx.fillStyle = '#ffffff'
  const corners: [number, number][] = [
    [s.x, s.y],
    [s.x + s.w, s.y],
    [s.x, s.y + s.h],
    [s.x + s.w, s.y + s.h],
  ]
  for (const [px, py] of corners) {
    ctx.fillRect(px - 5, py - 5, 10, 10)
  }
}

// ======================== 选区交互 ========================

type HandleMode = 'new' | 'move' | 'nw' | 'ne' | 'sw' | 'se' | null

let dragState: { mode: HandleMode; startX: number; startY: number; base: { x: number; y: number; w: number; h: number } } | null = null

function pos(e: PointerEvent) {
  const c = viewCanvas.value
  if (!c) return { x: 0, y: 0 }
  const r = c.getBoundingClientRect()
  return {
    x: (e.clientX - r.left) * (c.width / r.width),
    y: (e.clientY - r.top) * (c.height / r.height),
  }
}

function hit(px: number, py: number): HandleMode {
  const s = sel.value
  const t = 12
  if (Math.abs(px - s.x) <= t && Math.abs(py - s.y) <= t) return 'nw'
  if (Math.abs(px - (s.x + s.w)) <= t && Math.abs(py - s.y) <= t) return 'ne'
  if (Math.abs(px - s.x) <= t && Math.abs(py - (s.y + s.h)) <= t) return 'sw'
  if (Math.abs(px - (s.x + s.w)) <= t && Math.abs(py - (s.y + s.h)) <= t) return 'se'
  if (px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) return 'move'
  return 'new'
}

const CURSORS: Record<string, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  move: 'move',
  new: 'crosshair',
}

function onDown(e: PointerEvent) {
  const c = viewCanvas.value
  if (!c) return
  const p = pos(e)
  const mode = hit(p.x, p.y)
  dragState = { mode, startX: p.x, startY: p.y, base: { ...sel.value } }
  try {
    c.setPointerCapture(e.pointerId)
  } catch {
    /* 指针已释放时忽略 */
  }
  if (mode === 'new') {
    sel.value = { x: p.x, y: p.y, w: 16, h: 16 }
  }
  render()
}

function onMove(e: PointerEvent) {
  const c = viewCanvas.value
  if (!c) return
  if (!dragState) {
    const p = pos(e)
    cursor.value = CURSORS[hit(p.x, p.y) || 'new'] || 'crosshair'
    return
  }
  const p = pos(e)
  const cw = c.width
  const ch = c.height
  const b = dragState.base
  const ratio = ratioOf()
  const MIN = 16

  if (dragState.mode === 'move') {
    const nx = clamp(b.x + (p.x - dragState.startX), 0, cw - b.w)
    const ny = clamp(b.y + (p.y - dragState.startY), 0, ch - b.h)
    sel.value = { x: nx, y: ny, w: b.w, h: b.h }
  } else if (dragState.mode === 'new') {
    const ax = dragState.startX
    const ay = dragState.startY
    const dirX = p.x >= ax ? 1 : -1
    const dirY = p.y >= ay ? 1 : -1
    let w = Math.abs(p.x - ax)
    let h = Math.abs(p.y - ay)
    if (ratio) {
      if (w / ratio >= h) h = w / ratio
      else w = h * ratio
    }
    const availW = dirX > 0 ? cw - ax : ax
    const availH = dirY > 0 ? ch - ay : ay
    w = Math.min(w, availW)
    if (ratio) {
      h = Math.min(w / ratio, availH)
      w = h * ratio
    } else {
      h = Math.min(h, availH)
    }
    w = Math.max(MIN, w)
    h = Math.max(MIN, h)
    sel.value = { x: dirX > 0 ? ax : ax - w, y: dirY > 0 ? ay : ay - h, w, h }
  } else {
    // 四角缩放：固定对角锚点
    const m = dragState.mode
    const anchorX = m === 'nw' || m === 'sw' ? b.x + b.w : b.x
    const anchorY = m === 'nw' || m === 'ne' ? b.y + b.h : b.y
    let w = Math.abs(p.x - anchorX)
    let h = Math.abs(p.y - anchorY)
    if (ratio) h = w / ratio
    const availW = m === 'nw' || m === 'sw' ? anchorX : cw - anchorX
    const availH = m === 'nw' || m === 'ne' ? anchorY : ch - anchorY
    w = Math.min(w, availW)
    if (ratio) {
      h = Math.min(w / ratio, availH)
      w = h * ratio
    } else {
      h = Math.min(h, availH)
    }
    w = Math.max(MIN, w)
    h = Math.max(MIN, h)
    sel.value = {
      x: m === 'nw' || m === 'sw' ? anchorX - w : anchorX,
      y: m === 'nw' || m === 'ne' ? anchorY - h : anchorY,
      w,
      h,
    }
  }
  render()
}

function onUp() {
  dragState = null
}

// ======================== 派生操作 ========================

function rotate(dir: 1 | -1) {
  rotation.value += dir * 90
  rebuildWork()
}

function toggleFlipH() {
  flipH.value = !flipH.value
  rebuildWork()
}

function toggleFlipV() {
  flipV.value = !flipV.value
  rebuildWork()
}

function resetAll() {
  rotation.value = 0
  flipH.value = false
  flipV.value = false
  aspect.value = 'free'
  rebuildWork()
}

// ======================== 导出 ========================

async function exportCrop() {
  const w = work.value
  const c = viewCanvas.value
  if (!w || !c || exporting.value) return
  exporting.value = true
  try {
    const scale = w.width / c.width
    let sx = Math.round(sel.value.x * scale)
    let sy = Math.round(sel.value.y * scale)
    let sw = Math.round(sel.value.w * scale)
    let sh = Math.round(sel.value.h * scale)
    sx = clamp(sx, 0, w.width - 1)
    sy = clamp(sy, 0, w.height - 1)
    sw = clamp(sw, 1, w.width - sx)
    sh = clamp(sh, 1, w.height - sy)

    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    const ctx = out.getContext('2d')
    if (!ctx) return
    if (format.value === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, sw, sh)
    }
    ctx.drawImage(w, sx, sy, sw, sh, 0, 0, sw, sh)

    const mime = format.value === 'png' ? 'image/png' : format.value === 'jpeg' ? 'image/jpeg' : 'image/webp'
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, mime, quality.value / 100))
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cropped-${sw}x${sh}.${format.value === 'jpeg' ? 'jpg' : format.value}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } finally {
    exporting.value = false
  }
}

onBeforeUnmount(() => {
  if (srcUrl.value) URL.revokeObjectURL(srcUrl.value)
})
</script>

<template>
  <div class="space-y-5">
    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

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
      <span class="text-4xl">✂️</span>
      <div class="text-center">
        <p class="text-sm font-medium text-gray-700 dark:text-slate-300">点击或拖拽图片到此处</p>
        <p class="text-xs text-gray-400 dark:text-slate-500 mt-1">拖拽框选裁剪区域，拖动角点调整大小，图片不上传</p>
      </div>
    </div>

    <!-- 编辑区 -->
    <template v-if="img">
      <!-- 工具栏 -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <button @click="rotate(-1)" class="px-3 py-1.5 text-sm bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:text-accent transition-colors" title="向左旋转 90°">↺ 左转</button>
          <button @click="rotate(1)" class="px-3 py-1.5 text-sm bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:text-accent transition-colors border-l border-gray-200 dark:border-slate-700" title="向右旋转 90°">↻ 右转</button>
          <button @click="toggleFlipH" :class="['px-3 py-1.5 text-sm transition-colors border-l border-gray-200 dark:border-slate-700', flipH ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:text-accent']" title="水平翻转">⇋ 水平翻转</button>
          <button @click="toggleFlipV" :class="['px-3 py-1.5 text-sm transition-colors border-l border-gray-200 dark:border-slate-700', flipV ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:text-accent']" title="垂直翻转">⇅ 垂直翻转</button>
        </div>

        <div class="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <button
            v-for="a in ASPECTS"
            :key="a.key"
            @click="aspect = a.key"
            :class="['px-2.5 py-1.5 text-xs font-mono transition-colors border-l first:border-l-0 border-gray-200 dark:border-slate-700', aspect === a.key ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:text-accent']"
          >{{ a.label }}</button>
        </div>

        <div class="flex gap-2 ml-auto">
          <button @click="resetAll" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">重置</button>
          <button @click="fileInput?.click()" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">更换图片</button>
        </div>
      </div>

      <!-- 画布 -->
      <div>
        <canvas
          ref="viewCanvas"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
          @pointerleave="onUp"
          :style="{ cursor }"
          class="w-full max-w-[760px] mx-auto block rounded-xl border border-gray-200 dark:border-slate-700 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] dark:bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:16px_16px] touch-none select-none"
        ></canvas>
        <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-slate-600">
          <span>{{ file?.name }} · 原图 {{ img.naturalWidth }}×{{ img.naturalHeight }} · {{ fmtSize(fileSize) }}</span>
          <span class="px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">裁剪输出 {{ outputSize.w }}×{{ outputSize.h }} px</span>
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
          @click="exportCrop"
          :disabled="exporting"
          class="px-5 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-all"
        >{{ exporting ? '导出中…' : `导出裁剪（${outputSize.w}×${outputSize.h}）` }}</button>
      </div>
    </template>

    <!-- 说明 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
      <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-2">操作说明</h3>
      <ul class="text-xs text-gray-500 dark:text-slate-500 space-y-1 list-disc list-inside">
        <li>在图片任意位置拖拽可新建选区；拖动选区内部移动位置，拖动四角手柄调整大小</li>
        <li>选择固定宽高比（1:1 / 4:3 / 16:9 等）后，框选与缩放都会保持该比例；旋转或翻转后选区自动重置</li>
        <li>导出按原图分辨率完成，与预览所见一致；全程浏览器本地处理，不上传图片</li>
      </ul>
    </div>
  </div>
</template>
