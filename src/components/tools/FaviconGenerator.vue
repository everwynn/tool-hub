<script setup lang="ts">
// ============================================================
// FaviconGenerator — favicon 生成器
// 本地 canvas 缩放生成多尺寸 PNG，手写 ICO 容器打包 favicon.ico
// ============================================================

import { ref, computed, onBeforeUnmount } from 'vue'

const fileInput = ref<HTMLInputElement | null>(null)
const img = ref<HTMLImageElement | null>(null)
const file = ref<File | null>(null)
const previews = ref<{ size: number; url: string }[]>([])
const icoUrl = ref('')
const icoSize = ref(0)
const generating = ref(false)
const error = ref('')
const dragging = ref(false)

const SIZES = [16, 32, 48, 180, 192, 512]
const ICO_SIZES = [16, 32, 48]

const fileInfo = computed(() => {
  const image = img.value
  if (!image) return ''
  return `${image.naturalWidth}×${image.naturalHeight}`
})

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function cleanup() {
  if (icoUrl.value) URL.revokeObjectURL(icoUrl.value)
  icoUrl.value = ''
  icoSize.value = 0
  previews.value = []
  img.value = null
  file.value = null
  error.value = ''
}

function loadFile(f: File) {
  if (!f.type.startsWith('image/')) return
  cleanup()
  const url = URL.createObjectURL(f)
  const image = new Image()
  image.onload = async () => {
    if (!image.naturalWidth) {
      error.value = '该图片无法读取尺寸，SVG 建议先转换为 PNG 再上传'
      URL.revokeObjectURL(url)
      return
    }
    img.value = image
    file.value = f
    URL.revokeObjectURL(url)
    await generate()
  }
  image.onerror = () => {
    error.value = '图片加载失败，请更换文件（SVG 建议先转换为 PNG）'
    URL.revokeObjectURL(url)
  }
  image.src = url
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

// ======================== 缩放 ========================

/** 居中裁切为正方形并缩放到指定尺寸 */
function toSquare(image: HTMLImageElement, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  const side = Math.min(image.naturalWidth, image.naturalHeight)
  const sx = (image.naturalWidth - side) / 2
  const sy = (image.naturalHeight - side) / 2
  ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size)
  return c
}

function canvasPngBytes(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => {
      if (!b) {
        reject(new Error('PNG 编码失败'))
        return
      }
      b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)))
    }, 'image/png')
  })
}

/** 按 ICO 容器格式（Vista+ PNG 嵌入）打包 */
function buildIco(entries: { size: number; data: Uint8Array }[]): Blob {
  const headerSize = 6 + 16 * entries.length
  const header = new Uint8Array(headerSize)
  const dv = new DataView(header.buffer)
  dv.setUint16(0, 0, true) // reserved
  dv.setUint16(2, 1, true) // type = icon
  dv.setUint16(4, entries.length, true)

  let offset = headerSize
  entries.forEach((entry, i) => {
    const p = 6 + i * 16
    header[p] = entry.size >= 256 ? 0 : entry.size // width（0 表示 256）
    header[p + 1] = entry.size >= 256 ? 0 : entry.size // height
    header[p + 2] = 0 // 调色板数
    header[p + 3] = 0 // reserved
    dv.setUint16(p + 4, 1, true) // color planes
    dv.setUint16(p + 6, 32, true) // bpp
    dv.setUint32(p + 8, entry.data.length, true) // 数据大小
    dv.setUint32(p + 12, offset, true) // 数据偏移
    offset += entry.data.length
  })

  return new Blob([header, ...entries.map((e) => e.data)] as BlobPart[], { type: 'image/x-icon' })
}

// ======================== 生成 ========================

async function generate() {
  const image = img.value
  if (!image) return
  generating.value = true
  error.value = ''
  try {
    previews.value = SIZES.map((size) => ({
      size,
      url: toSquare(image, Math.min(size, 256)).toDataURL('image/png'),
    }))
    const entries = await Promise.all(
      ICO_SIZES.map(async (size) => ({ size, data: await canvasPngBytes(toSquare(image, size)) }))
    )
    const icoBlob = buildIco(entries)
    if (icoUrl.value) URL.revokeObjectURL(icoUrl.value)
    icoUrl.value = URL.createObjectURL(icoBlob)
    icoSize.value = icoBlob.size
  } catch (e) {
    error.value = e instanceof Error ? `生成失败：${e.message}` : '生成失败'
  } finally {
    generating.value = false
  }
}

// ======================== 下载 ========================

function downloadIco() {
  if (!icoUrl.value) return
  const a = document.createElement('a')
  a.href = icoUrl.value
  a.download = 'favicon.ico'
  a.click()
}

async function downloadPng(size: number) {
  const image = img.value
  if (!image) return
  const blob = await new Promise<Blob | null>((r) => toSquare(image, size).toBlob(r, 'image/png'))
  if (!blob) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = size === 180 ? 'apple-touch-icon.png' : `favicon-${size}x${size}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

async function downloadAll() {
  downloadIco()
  for (const size of SIZES) {
    await new Promise((r) => setTimeout(r, 350))
    await downloadPng(size)
  }
}

const SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`

const copied = ref(false)
const copySnippet = async () => {
  await navigator.clipboard.writeText(SNIPPET)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

onBeforeUnmount(cleanup)
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
      :class="['flex flex-col items-center justify-center gap-3 py-16 rounded-xl border-2 border-dashed cursor-pointer transition-all', dragging
        ? 'border-accent bg-accent/5'
        : 'border-gray-300 dark:border-slate-600 hover:border-accent/60 bg-gray-50 dark:bg-slate-900/40']"
    >
      <span class="text-4xl">🌟</span>
      <div class="text-center">
        <p class="text-sm font-medium text-gray-700 dark:text-slate-300">点击或拖拽图片到此处</p>
        <p class="text-xs text-gray-400 dark:text-slate-500 mt-1">建议 512×512 以上正方形 PNG；非正方形图片会自动居中裁切</p>
      </div>
    </div>

    <!-- 结果区 -->
    <template v-if="img">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <span>{{ file?.name }} · {{ fileInfo }}</span>
          <span v-if="error" class="text-red-500 dark:text-red-400">{{ error }}</span>
        </div>
        <div class="flex gap-2">
          <button @click="fileInput?.click()" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">更换图片</button>
          <button
            @click="downloadAll"
            :disabled="generating || !icoUrl"
            class="text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-all"
          >下载全部（ICO + 6 PNG）</button>
        </div>
      </div>

      <div v-if="generating" class="text-sm text-gray-500 dark:text-slate-400 py-8 text-center">正在生成多尺寸图标…</div>

      <template v-else>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <!-- ICO 卡片 -->
          <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4 flex flex-col items-center gap-2">
            <div class="h-16 flex items-center justify-center">
              <img v-if="previews.length" :src="previews[1]?.url" alt="favicon.ico" class="w-8 h-8" />
            </div>
            <div class="text-center">
              <p class="text-xs font-semibold text-gray-700 dark:text-slate-300">favicon.ico</p>
              <p class="text-xs text-gray-400 dark:text-slate-500">16 + 32 + 48 多尺寸 · {{ fmtSize(icoSize) }}</p>
            </div>
            <button @click="downloadIco" class="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">下载 ICO</button>
          </div>

          <!-- PNG 卡片 -->
          <div
            v-for="p in previews"
            :key="p.size"
            class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4 flex flex-col items-center gap-2"
          >
            <div class="h-16 flex items-center justify-center">
              <img :src="p.url" :alt="`${p.size}px`" :style="{ width: Math.min(p.size, 64) + 'px', height: Math.min(p.size, 64) + 'px' }" class="[image-rendering:pixelated]" />
            </div>
            <div class="text-center">
              <p class="text-xs font-semibold text-gray-700 dark:text-slate-300">{{ p.size }}×{{ p.size }}</p>
              <p class="text-xs text-gray-400 dark:text-slate-500">{{ p.size === 180 ? 'apple-touch-icon' : 'favicon PNG' }}</p>
            </div>
            <button @click="downloadPng(p.size)" class="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">下载 PNG</button>
          </div>
        </div>

        <!-- HTML 引用代码 -->
        <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-300">在 HTML &lt;head&gt; 中引用</h3>
            <button
              @click="copySnippet"
              :class="['text-xs px-2.5 py-0.5 rounded border transition-all', copied ? 'border-green-400 text-green-600 dark:text-green-400' : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/40 hover:text-accent']"
            >{{ copied ? '已复制' : '复制' }}</button>
          </div>
          <pre class="text-xs font-mono text-gray-700 dark:text-slate-300 bg-gray-50 dark:bg-slate-950/50 rounded-lg p-3 overflow-x-auto leading-relaxed"><code>{{ SNIPPET }}</code></pre>
          <p class="mt-2 text-xs text-gray-400 dark:text-slate-600">将 PNG 与 ICO 文件放入站点根目录即可；「下载全部」会触发多次下载，浏览器可能提示允许多文件下载。</p>
        </div>
      </template>
    </template>

    <!-- 说明 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
      <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-2">生成规则</h3>
      <ul class="text-xs text-gray-500 dark:text-slate-500 space-y-1 list-disc list-inside">
        <li>favicon.ico 内含 16/32/48 三个尺寸，采用 PNG 嵌入格式（Vista 及以上浏览器支持）</li>
        <li>PNG 套件包含 16/32/48/180/192/512 六个尺寸，180 为 apple-touch-icon 专用命名</li>
        <li>图片在浏览器本地缩放与打包，不会上传；非正方形图片按最短边居中裁切</li>
      </ul>
    </div>
  </div>
</template>
