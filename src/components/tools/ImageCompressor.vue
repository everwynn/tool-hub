<script setup lang="ts">
// ============================================================
// ImageCompressor — 图片压缩 / 格式转换
// canvas 本地重编码：WebP / JPEG / PNG，质量与尺寸可调，数据不上传
// ============================================================

import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

type Format = 'webp' | 'jpeg' | 'png'

const file = ref<File | null>(null)
const origUrl = ref('')
const origW = ref(0)
const origH = ref(0)

const format = ref<Format>('webp')
const quality = ref(80)
const maxEdge = ref(0)
const bgColor = ref('#ffffff')

const outUrl = ref('')
const outBlob = ref<Blob | null>(null)
const outW = ref(0)
const outH = ref(0)

const processing = ref(false)
const errorMsg = ref('')
const dragging = ref(false)
const webpSupported = ref(true)
const copied = ref(false)

const fileInput = ref<HTMLInputElement | null>(null)

let sourceBitmap: ImageBitmap | null = null

// ======================== 工具函数 ========================

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const savedPct = computed(() => {
  if (!file.value || !outBlob.value) return 0
  return Math.round((1 - outBlob.value.size / file.value.size) * 100)
})

const fileSize = computed(() => file.value?.size ?? 0)

// ======================== 加载与编码 ========================

async function loadFile(f: File) {
  if (!f.type.startsWith('image/')) {
    errorMsg.value = '请选择图片文件'
    return
  }
  if (f.size > 50 * 1024 * 1024) {
    errorMsg.value = '图片超过 50MB，请先压缩后再试'
    return
  }
  errorMsg.value = ''
  if (origUrl.value) URL.revokeObjectURL(origUrl.value)
  if (outUrl.value) URL.revokeObjectURL(outUrl.value)
  outBlob.value = null
  outUrl.value = ''

  file.value = f
  origUrl.value = URL.createObjectURL(f)

  try {
    sourceBitmap?.close()
    sourceBitmap = await createImageBitmap(f)
    origW.value = sourceBitmap.width
    origH.value = sourceBitmap.height
    await encode()
  } catch {
    // createImageBitmap 失败时回退给 <img> 预览
    const img = new Image()
    img.onload = () => {
      origW.value = img.naturalWidth
      origH.value = img.naturalHeight
      sourceBitmap = null
      errorMsg.value = '该图片格式暂不支持重新编码，仅能预览'
    }
    img.src = origUrl.value
  }
}

async function encode() {
  if (!file.value || !sourceBitmap) return
  processing.value = true
  try {
    let w = sourceBitmap.width
    let h = sourceBitmap.height
    if (maxEdge.value > 0 && Math.max(w, h) > maxEdge.value) {
      const scale = maxEdge.value / Math.max(w, h)
      w = Math.max(1, Math.round(w * scale))
      h = Math.max(1, Math.round(h * scale))
    }

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    if (format.value === 'jpeg') {
      ctx.fillStyle = bgColor.value
      ctx.fillRect(0, 0, w, h)
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(sourceBitmap, 0, 0, w, h)

    const mime = format.value === 'jpeg' ? 'image/jpeg' : format.value === 'png' ? 'image/png' : 'image/webp'
    const q = format.value === 'png' ? undefined : quality.value / 100
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, q))
    if (!blob) throw new Error('编码失败，请尝试其他格式')

    if (outUrl.value) URL.revokeObjectURL(outUrl.value)
    outBlob.value = blob
    outUrl.value = URL.createObjectURL(blob)
    outW.value = w
    outH.value = h
    errorMsg.value = ''
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '处理失败'
  } finally {
    processing.value = false
  }
}

// ======================== 交互 ========================

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) loadFile(f)
  ;(e.target as HTMLInputElement).value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) loadFile(f)
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const it of items) {
    if (it.type.startsWith('image/')) {
      const f = it.getAsFile()
      if (f) {
        e.preventDefault()
        loadFile(f)
      }
      break
    }
  }
}

function download() {
  if (!outBlob.value || !file.value) return
  const ext = format.value === 'jpeg' ? 'jpg' : format.value
  const base = file.value.name.replace(/\.[^.]+$/, '')
  const a = document.createElement('a')
  a.href = outUrl.value
  a.download = `${base}-compressed.${ext}`
  a.click()
}

const copyInfo = async () => {
  if (!file.value || !outBlob.value) return
  const info = `${file.value.name}: ${fmtSize(file.value.size)} → ${fmtSize(outBlob.value.size)}（${savedPct.value > 0 ? '减少' : '增大'} ${Math.abs(savedPct.value)}%）`
  await navigator.clipboard.writeText(info)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

// ======================== 生命周期 ========================

let watchTimer: number | undefined
watch([format, quality, maxEdge, bgColor], () => {
  if (!file.value) return
  window.clearTimeout(watchTimer)
  watchTimer = window.setTimeout(encode, 250)
})

onMounted(() => {
  const c = document.createElement('canvas')
  webpSupported.value = c.toDataURL('image/webp').startsWith('data:image/webp')
  if (!webpSupported.value) format.value = 'jpeg'
  window.addEventListener('paste', onPaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
  window.clearTimeout(watchTimer)
  if (origUrl.value) URL.revokeObjectURL(origUrl.value)
  if (outUrl.value) URL.revokeObjectURL(outUrl.value)
  sourceBitmap?.close()
})
</script>

<template>
  <div class="space-y-5">
    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

    <!-- 上传区（无文件时） -->
    <div
      v-if="!file"
      @click="fileInput?.click()"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
      :class="['rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors select-none',
        dragging
          ? 'border-accent bg-accent/5'
          : 'border-gray-200 dark:border-slate-700 hover:border-accent/50 bg-gray-50 dark:bg-slate-900/40']"
    >
      <div class="text-4xl mb-3">🖼️</div>
      <div class="text-sm font-medium text-gray-700 dark:text-slate-300">点击选择图片，或拖拽到这里</div>
      <div class="text-xs text-gray-400 dark:text-slate-600 mt-1.5">支持 PNG / JPEG / WebP / GIF / AVIF，也可以直接 Ctrl+V 粘贴图片</div>
      <div class="text-xs text-gray-400 dark:text-slate-600 mt-1">单张不超过 50MB，全程本地处理，不会上传</div>
    </div>

    <!-- 有文件时 -->
    <template v-else>
      <!-- 预览对比 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 overflow-hidden">
          <div class="px-3 py-2 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">原图</span>
            <span class="text-xs text-gray-400 dark:text-slate-600">{{ fmtSize(fileSize) }} · {{ origW }}×{{ origH }}</span>
          </div>
          <div class="h-48 flex items-center justify-center bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] dark:bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:16px_16px]">
            <img :src="origUrl" alt="原图预览" class="max-h-48 max-w-full object-contain" />
          </div>
        </div>
        <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 overflow-hidden">
          <div class="px-3 py-2 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">输出</span>
            <span v-if="outBlob" class="text-xs text-gray-400 dark:text-slate-600">{{ fmtSize(outBlob.size) }} · {{ outW }}×{{ outH }}</span>
            <span v-else class="text-xs text-gray-400 dark:text-slate-600">{{ processing ? '处理中…' : '—' }}</span>
          </div>
          <div class="h-48 flex items-center justify-center bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] dark:bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:16px_16px]">
            <img v-if="outUrl" :src="outUrl" alt="压缩预览" class="max-h-48 max-w-full object-contain" />
            <span v-else class="text-xs text-gray-300 dark:text-slate-700">{{ processing ? '正在编码…' : '选择参数后自动生成' }}</span>
          </div>
        </div>
      </div>

      <!-- 压缩结果 -->
      <div v-if="outBlob" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 rounded-xl border bg-white dark:bg-slate-900/40"
        :class="savedPct > 0 ? 'border-green-200 dark:border-green-900/50' : 'border-amber-200 dark:border-amber-900/50'">
        <span class="text-sm font-semibold" :class="savedPct > 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'">
          {{ savedPct > 0 ? `体积减少 ${savedPct}%` : savedPct < 0 ? `体积增大 ${-savedPct}%` : '体积基本持平' }}
        </span>
        <span class="text-xs text-gray-500 dark:text-slate-400">{{ fmtSize(fileSize) }} → {{ fmtSize(outBlob.size) }}</span>
        <span v-if="outW !== origW || outH !== origH" class="text-xs text-gray-500 dark:text-slate-400">尺寸 {{ origW }}×{{ origH }} → {{ outW }}×{{ outH }}</span>
        <div class="flex-1"></div>
        <button @click="copyInfo" class="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">{{ copied ? '已复制' : '复制信息' }}</button>
        <button @click="download" class="text-xs px-3 py-1 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity">下载图片</button>
      </div>

      <!-- 参数 -->
      <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4 space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-xs font-semibold text-gray-500 dark:text-slate-400 w-20">输出格式</span>
          <div class="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <button
              v-for="f in (['webp', 'jpeg', 'png'] as Format[])"
              :key="f"
              @click="format = f"
              :disabled="f === 'webp' && !webpSupported"
              :class="['px-3 py-1.5 text-sm font-mono uppercase transition-colors', format === f
                ? 'bg-accent text-white'
                : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:text-accent disabled:opacity-40']"
            >{{ f }}</button>
          </div>
          <span v-if="!webpSupported" class="text-xs text-amber-600 dark:text-amber-400">当前浏览器不支持 WebP 编码</span>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <span class="text-xs font-semibold text-gray-500 dark:text-slate-400 w-20">质量</span>
          <input
            v-model.number="quality"
            type="range"
            min="10"
            max="100"
            step="1"
            :disabled="format === 'png'"
            class="flex-1 min-w-40 accent-accent disabled:opacity-40"
          />
          <span class="text-sm font-mono text-gray-600 dark:text-slate-400 w-12 text-right">{{ format === 'png' ? '无损' : quality + '%' }}</span>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <span class="text-xs font-semibold text-gray-500 dark:text-slate-400 w-20">最大边</span>
          <input
            v-model.number="maxEdge"
            type="number"
            min="0"
            max="10000"
            step="100"
            class="w-28 px-3 py-1.5 text-sm font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
          />
          <span class="text-xs text-gray-400 dark:text-slate-600">px，0 表示保持原始尺寸；超出时按比例缩小</span>
        </div>

        <div v-if="format === 'jpeg'" class="flex flex-wrap items-center gap-3">
          <span class="text-xs font-semibold text-gray-500 dark:text-slate-400 w-20">背景色</span>
          <input v-model="bgColor" type="color" class="w-10 h-8 rounded border border-gray-200 dark:border-slate-700 bg-transparent cursor-pointer" />
          <span class="text-xs text-gray-400 dark:text-slate-600">透明区域将填充此颜色（JPEG 不支持透明）</span>
        </div>

        <div class="flex items-center gap-2 pt-1">
          <button @click="fileInput?.click()" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">更换图片</button>
          <span v-if="processing" class="text-xs text-gray-400 dark:text-slate-600">正在重新编码…</span>
        </div>
      </div>
    </template>

    <div v-if="errorMsg" class="text-xs text-red-500 dark:text-red-400">{{ errorMsg }}</div>

    <!-- 说明 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
      <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-2">说明</h3>
      <ul class="text-xs text-gray-500 dark:text-slate-500 space-y-1 list-disc list-inside">
        <li>图片在浏览器内通过 canvas 重新编码，不会上传到任何服务器</li>
        <li>WebP 通常比 JPEG 小 25%~35%；PNG 为无损格式，质量参数不生效</li>
        <li>GIF 动图仅保留第一帧；超大图片建议先设置「最大边」再导出</li>
      </ul>
    </div>
  </div>
</template>
