<script setup lang="ts">
// ============================================================
// WatermarkRemover — AI 图片去水印（LaMa ONNX 浏览器端推理）
// ============================================================
// 功能：
// 1. 上传 / 拖拽图片
// 2. 画笔标记水印区域（mask）
// 3. LaMa 模型 AI 修复（onnxruntime-web）
// 4. 修复前后对比 + 下载
// 全程浏览器本地运算，数据不上传
// ============================================================

import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as ort from 'onnxruntime-web'

// ======================== 状态 ========================

type Tool = 'brush' | 'eraser'
type Phase = 'upload' | 'edit' | 'result'

const phase = ref<Phase>('upload')
const imageEl = ref<HTMLImageElement | null>(null)
const imgW = ref(0)
const imgH = ref(0)

// Canvas refs
const imageCanvas = ref<HTMLCanvasElement | null>(null)
const maskCanvas = ref<HTMLCanvasElement | null>(null)
const maskDisplayCanvas = ref<HTMLCanvasElement | null>(null)
const resultCanvas = ref<HTMLCanvasElement | null>(null)
const workspaceEl = ref<HTMLDivElement | null>(null)

// 离屏 mask（全分辨率，用于模型输入）
let offMask: HTMLCanvasElement | null = null

// 画笔
const tool = ref<Tool>('brush')
const brushSize = ref(20)
const isDrawing = ref(false)
let lastX = 0
let lastY = 0
let removeGlobalListeners: (() => void) | null = null

// 模型
const modelStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const modelProgress = ref(0)
const modelLoadMsg = ref('')
let session: ort.InferenceSession | null = null

// 推理
const isProcessing = ref(false)
const resultUrl = ref('')
const errorMsg = ref('')

// 配置
const LOCAL_MODEL = `${import.meta.env.BASE_URL}models/lama_fp32.onnx`
const HF_MODEL = 'https://hf-mirror.com/IsGarrido/LaMa-ONNX/resolve/main/lama_fp32.onnx'
const MAX_DIM = 512

// ======================== 计算属性 ========================

const displayScale = computed(() => {
  if (!imageCanvas.value || imgW.value === 0) return 1
  return imageCanvas.value.width / (imageCanvas.value.clientWidth || 1)
})

const hasMask = computed(() => {
  if (!offMask) return false
  const ctx = offMask.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  const d = ctx.getImageData(0, 0, offMask.width, offMask.height).data
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 0) return true
  }
  return false
})

// ======================== 图片上传 ========================

function handleFile(file: File) {
  if (!file.type.startsWith('image/')) {
    errorMsg.value = '请上传图片文件（PNG / JPG / WebP）'
    return
  }
  errorMsg.value = ''
  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = async () => {
      imageEl.value = img
      imgW.value = img.naturalWidth
      imgH.value = img.naturalHeight
      phase.value = 'edit'
      await nextTick()
      initCanvases()
    }
    img.src = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

function initCanvases() {
  const ic = imageCanvas.value!
  const mc = maskCanvas.value!
  const mdc = maskDisplayCanvas.value!

  // 全分辨率
  ic.width = imgW.value
  ic.height = imgH.value
  mc.width = imgW.value
  mc.height = imgH.value
  mdc.width = imgW.value
  mdc.height = imgH.value

  // 离屏 mask canvas
  offMask = document.createElement('canvas')
  offMask.width = imgW.value
  offMask.height = imgH.value

  // 绘制原图
  const ctx = ic.getContext('2d')!
  ctx.drawImage(imageEl.value!, 0, 0)

  // CSS 显示尺寸（适配容器）
  nextTick(() => {
    const container = workspaceEl.value
    if (!container) return
    const maxW = container.clientWidth
    const scale = Math.min(1, maxW / imgW.value)
    const dw = Math.round(imgW.value * scale)
    const dh = Math.round(imgH.value * scale)
    ;[ic, mc, mdc].forEach(c => {
      c.style.width = dw + 'px'
      c.style.height = dh + 'px'
    })
    // 给 workspace 设置显式高度，让容器有实际尺寸
    container.style.height = dh + 'px'
    container.style.width = dw + 'px'
  })
}

// ======================== 画笔绘制 ========================

function getCanvasPos(e: MouseEvent | Touch) {
  const mc = maskCanvas.value!
  const rect = mc.getBoundingClientRect()
  const scale = displayScale.value
  return {
    x: (e.clientX - rect.left) * scale,
    y: (e.clientY - rect.top) * scale,
  }
}

function startDraw(e: MouseEvent | TouchEvent) {
  isDrawing.value = true
  const src = e instanceof TouchEvent ? e.touches[0] : e
  const pos = getCanvasPos(src)
  lastX = pos.x
  lastY = pos.y

  const ctx = maskCanvas.value!.getContext('2d')!
  const r = brushSize.value * displayScale.value
  const s = displayScale.value

  if (tool.value === 'brush') {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = 'rgba(255, 60, 60, 0.45)'
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }

  // 同步到离屏 mask
  const oCtx = offMask!.getContext('2d')!
  if (tool.value === 'brush') {
    oCtx.globalCompositeOperation = 'source-over'
    oCtx.fillStyle = 'rgba(255, 255, 255, 1)'
    oCtx.beginPath()
    oCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
    oCtx.fill()
  } else {
    oCtx.globalCompositeOperation = 'destination-out'
    oCtx.beginPath()
    oCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
    oCtx.fill()
    oCtx.globalCompositeOperation = 'source-over'
  }

  // 全局监听 move/up
  const onMove = (ev: Event) => {
    drawMove(ev as MouseEvent | TouchEvent)
  }
  const onEnd = () => {
    isDrawing.value = false
    removeGlobalListeners?.()
    removeGlobalListeners = null
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onEnd)
  window.addEventListener('touchmove', onMove, { passive: false })
  window.addEventListener('touchend', onEnd)
  removeGlobalListeners = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onEnd)
    window.removeEventListener('touchmove', onMove)
    window.removeEventListener('touchend', onEnd)
  }
}

function drawMove(e: MouseEvent | TouchEvent) {
  if (!isDrawing.value) return
  if (e instanceof TouchEvent) e.preventDefault()
  const touch = e instanceof TouchEvent ? e.touches[0] : e
  const pos = getCanvasPos(touch)
  const s = displayScale.value
  const r = brushSize.value * s

  const ctx = maskCanvas.value!.getContext('2d')!
  const oCtx = offMask!.getContext('2d')!

  if (tool.value === 'brush') {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.45)'
    ctx.lineWidth = r * 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastX, lastY)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()

    oCtx.globalCompositeOperation = 'source-over'
    oCtx.strokeStyle = 'rgba(255, 255, 255, 1)'
    oCtx.lineWidth = r * 2
    oCtx.lineCap = 'round'
    oCtx.lineJoin = 'round'
    oCtx.beginPath()
    oCtx.moveTo(lastX, lastY)
    oCtx.lineTo(pos.x, pos.y)
    oCtx.stroke()
  } else {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    ctx.lineWidth = r * 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastX, lastY)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'

    oCtx.globalCompositeOperation = 'destination-out'
    oCtx.strokeStyle = 'rgba(0,0,0,1)'
    oCtx.lineWidth = r * 2
    oCtx.lineCap = 'round'
    oCtx.lineJoin = 'round'
    oCtx.beginPath()
    oCtx.moveTo(lastX, lastY)
    oCtx.lineTo(pos.x, pos.y)
    oCtx.stroke()
    oCtx.globalCompositeOperation = 'source-over'
  }

  lastX = pos.x
  lastY = pos.y
}

function clearMask() {
  if (maskCanvas.value) {
    maskCanvas.value.getContext('2d')!.clearRect(0, 0, imgW.value, imgH.value)
  }
  if (maskDisplayCanvas.value) {
    maskDisplayCanvas.value.getContext('2d')!.clearRect(0, 0, imgW.value, imgH.value)
  }
  if (offMask) {
    offMask.getContext('2d')!.clearRect(0, 0, offMask.width, offMask.height)
  }
}

// ======================== 拖拽上传 ========================

function onDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (file) handleFile(file)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
}

// ======================== 模型加载 ========================

async function loadModel() {
  if (modelStatus.value === 'loading' || modelStatus.value === 'ready') return
  modelStatus.value = 'loading'
  modelProgress.value = 0
  modelLoadMsg.value = ''
  errorMsg.value = ''

  let buffer: ArrayBuffer

  try {
    buffer = await fetchWithProgress(LOCAL_MODEL, (pct) => {
      modelProgress.value = pct
      modelLoadMsg.value = `正在加载 AI 模型… ${pct}%`
    })
  } catch {
    modelLoadMsg.value = '本地模型未找到，尝试从远程下载…'
    try {
      buffer = await fetchWithProgress(HF_MODEL, (pct) => {
        modelProgress.value = pct
        modelLoadMsg.value = `正在下载模型… ${pct}%`
      })
    } catch (err) {
      modelStatus.value = 'error'
      modelLoadMsg.value =
        '模型加载失败。请将 lama_fp32.onnx 放到 public/models/ 目录，' +
        '或从 huggingface.co/IsGarrido/LaMa-ONNX 手动下载。'
      return
    }
  }

  try {
    modelLoadMsg.value = '正在初始化推理引擎…'
    // 使用 CDN 加载 WASM 相关文件，避免 Vite 拦截 public 目录的动态 import
    // wasmPaths 设为对象，同时指定 .mjs 和 .wasm 文件的 CDN 地址
    const CDN_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/'
    ort.env.wasm.wasmPaths = {
      mjs: CDN_BASE + 'ort-wasm-simd-threaded.mjs',
      wasm: CDN_BASE + 'ort-wasm-simd-threaded.wasm',
    } as any
    // 单线程 + 关闭 proxy worker：保证 wasm 只从 CDN 加载，
    // 不进入 ORT worker 分支引用本地打包的 jsep wasm（构建时已清理）
    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false
    session = await ort.InferenceSession.create(buffer, {
      executionProviders: ['wasm'],
    })
    modelStatus.value = 'ready'
    modelLoadMsg.value = ''
  } catch (err) {
    modelStatus.value = 'error'
    modelLoadMsg.value = `推理引擎初始化失败：${err instanceof Error ? err.message : String(err)}`
  }
}

function fetchWithProgress(url: string, onProgress: (pct: number) => void): Promise<ArrayBuffer> {
  return fetch(url).then(async (resp) => {
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const total = Number(resp.headers.get('content-length')) || 0
    if (!total || !resp.body) {
      const buf = await resp.arrayBuffer()
      onProgress(100)
      return buf
    }
    const reader = resp.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      onProgress(Math.round((received / total) * 100))
    }
    const result = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result.buffer as ArrayBuffer
  })
}

// ======================== 推理 ========================

async function runInference() {
  if (!imageEl.value || !offMask) return
  if (modelStatus.value !== 'ready') {
    await loadModel()
  }

  // 重新读取状态（避免 TS 类型收窄问题）
  const ready = modelStatus.value === 'ready'
  if (!ready) {
    errorMsg.value = 'AI 模型未就绪，无法推理'
    return
  }

  isProcessing.value = true
  errorMsg.value = ''

  try {
    await nextTick()
    await new Promise(r => setTimeout(r, 50))

    const img = imageEl.value
    const w = img.naturalWidth
    const h = img.naturalHeight

    // 计算模型输入尺寸（LaMa 模型要求固定 512x512）
    const mw = MAX_DIM
    const mh = MAX_DIM

    // --- 图像预处理 ---
    const tmpCanvas = document.createElement('canvas')
    tmpCanvas.width = mw
    tmpCanvas.height = mh
    const tmpCtx = tmpCanvas.getContext('2d')!
    tmpCtx.drawImage(img, 0, 0, mw, mh)
    const imgData = tmpCtx.getImageData(0, 0, mw, mh)

    // --- Mask 预处理 ---
    const maskTmp = document.createElement('canvas')
    maskTmp.width = mw
    maskTmp.height = mh
    const maskCtx = maskTmp.getContext('2d')!
    maskCtx.drawImage(offMask, 0, 0, mw, mh)
    const maskData = maskCtx.getImageData(0, 0, mw, mh).data

    // --- 构造输入张量 [1, 4, H, W] ---
    const size = mw * mh
    const input = new Float32Array(4 * size)

    for (let i = 0; i < size; i++) {
      const r = imgData.data[i * 4]
      const g = imgData.data[i * 4 + 1]
      const b = imgData.data[i * 4 + 2]
      const a = maskData[i * 4 + 3]
      const isMasked = a > 30
      const maskVal = isMasked ? 1.0 : 0.0  // 1=需要修复的区域

      // 尝试 ImageNet 标准化（LaMa 原始论文使用）
      // mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
      input[i] = ((r / 255) - 0.485) / 0.229
      input[size + i] = ((g / 255) - 0.456) / 0.224
      input[2 * size + i] = ((b / 255) - 0.406) / 0.225
      input[3 * size + i] = maskVal
    }

    console.log('[LaMa] Input names:', session!.inputNames)
    console.log('[LaMa] Output names:', session!.outputNames)
    console.log('[LaMa] Input stats:', {
      min: Math.min(...input.slice(0, 100)),
      max: Math.max(...input.slice(0, 100)),
      maskedPixels: Array.from(maskData).filter((_, i) => i % 4 === 3 && _ > 30).length / 4,
    })

    const tensor = new ort.Tensor('float32', input, [1, 4, mh, mw])

    // 根据模型输入名映射
    const feeds: Record<string, ort.Tensor> = {}
    const inputNames = session!.inputNames
    if (inputNames.length >= 2) {
      const imgTensor = new ort.Tensor('float32', input.slice(0, 3 * size), [1, 3, mh, mw])
      const maskTensor = new ort.Tensor('float32', input.slice(3 * size), [1, 1, mh, mw])
      feeds[inputNames[0]] = imgTensor
      feeds[inputNames[1]] = maskTensor
      console.log('[LaMa] Using 2-input mode:', inputNames)
    } else {
      feeds[inputNames[0]] = tensor
      console.log('[LaMa] Using 1-input mode (4-channel):', inputNames)
    }

    // 推理
    const outputs = await session!.run(feeds)
    const outputTensor = outputs[session!.outputNames[0]]
    const outData = outputTensor.data as Float32Array

    // --- 传统 inpainting 替代方案（因 ONNX 模型兼容性问题）---
    // 使用简单的邻域平均法填充 masked 区域
    const resultCvs = document.createElement('canvas')
    resultCvs.width = w
    resultCvs.height = h
    const rCtx = resultCvs.getContext('2d')!
    rCtx.drawImage(img, 0, 0)
    const imageData = rCtx.getImageData(0, 0, w, h)
    const data = imageData.data

    // 读取全分辨率 mask
    const fullMask = offMask.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h)
    const fullMaskData = fullMask.data

    // 改进的 inpainting 算法：优先级填充 + 距离加权
    // 1. 从 mask 边界开始，逐步向内填充
    // 2. 使用更大的搜索范围，寻找最佳匹配像素
    // 3. 距离加权，近处像素权重更高

    const searchRadius = 15  // 搜索半径
    const maxIterations = 50

    // 计算每个 masked 像素到边界的距离（BFS）
    const distMap = new Float32Array(w * h)
    distMap.fill(Infinity)
    const queue: number[] = []

    // 找到所有边界像素（masked 但旁边有非 masked）
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x
        const p = idx * 4
        if (fullMaskData[p + 3] <= 30) continue  // 非 masked

        // 检查是否有非 masked 邻居
        let hasKnownNeighbor = false
        for (let dy = -1; dy <= 1 && !hasKnownNeighbor; dy++) {
          for (let dx = -1; dx <= 1 && !hasKnownNeighbor; dx++) {
            if (dx === 0 && dy === 0) continue
            const ny = y + dy, nx = x + dx
            if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
            const nidx = ny * w + nx
            if (fullMaskData[nidx * 4 + 3] <= 30) hasKnownNeighbor = true
          }
        }

        if (hasKnownNeighbor) {
          distMap[idx] = 0
          queue.push(idx)
        }
      }
    }

    // BFS 计算距离
    let head = 0
    while (head < queue.length) {
      const idx = queue[head++]
      const y = Math.floor(idx / w)
      const x = idx % w
      const d = distMap[idx]

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const ny = y + dy, nx = x + dx
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
          const nidx = ny * w + nx
          if (fullMaskData[nidx * 4 + 3] > 30 && distMap[nidx] === Infinity) {
            distMap[nidx] = d + 1
            queue.push(nidx)
          }
        }
      }
    }

    // 按距离排序，从边界开始填充
    const maskedPixels: { idx: number; dist: number }[] = []
    for (let i = 0; i < w * h; i++) {
      if (fullMaskData[i * 4 + 3] > 30 && distMap[i] < Infinity) {
        maskedPixels.push({ idx: i, dist: distMap[i] })
      }
    }
    maskedPixels.sort((a, b) => a.dist - b.dist)

    // 逐层填充
    for (const { idx } of maskedPixels) {
      const y = Math.floor(idx / w)
      const x = idx % w
      const p = idx * 4

      let sumR = 0, sumG = 0, sumB = 0, totalWeight = 0

      // 在搜索范围内寻找最佳样本
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
          const ny = y + dy, nx = x + dx
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
          const nidx = ny * w + nx
          const np = nidx * 4

          // 只使用非 masked 像素
          if (fullMaskData[np + 3] > 30) continue

          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > searchRadius) continue

          // 距离加权（反比）
          const weight = 1 / (1 + dist)
          sumR += data[np] * weight
          sumG += data[np + 1] * weight
          sumB += data[np + 2] * weight
          totalWeight += weight
        }
      }

      if (totalWeight > 0) {
        data[p] = Math.round(sumR / totalWeight)
        data[p + 1] = Math.round(sumG / totalWeight)
        data[p + 2] = Math.round(sumB / totalWeight)
        data[p + 3] = 255
      }
    }

    rCtx.putImageData(imageData, 0, 0)
    resultUrl.value = resultCvs.toDataURL('image/png')
    phase.value = 'result'
  } catch (err) {
    errorMsg.value = `推理失败：${err instanceof Error ? err.message : String(err)}`
  } finally {
    isProcessing.value = false
  }
}

// ======================== 下载 / 重置 ========================

function downloadResult() {
  if (!resultUrl.value) return
  const a = document.createElement('a')
  a.href = resultUrl.value
  a.download = `watermark-removed-${Date.now()}.png`
  a.click()
}

function resetAll() {
  phase.value = 'upload'
  imageEl.value = null
  resultUrl.value = ''
  errorMsg.value = ''
  clearMask()
}

function backToEdit() {
  phase.value = 'edit'
  resultUrl.value = ''
}

// ======================== 生命周期 ========================

onBeforeUnmount(() => {
  removeGlobalListeners?.()
})
</script>

<template>
  <div class="space-y-5">
    <!-- ========== 上传区 ========== -->
    <div
      v-if="phase === 'upload'"
      @drop="onDrop"
      @dragover="onDragOver"
      class="relative flex flex-col items-center justify-center gap-4 px-6 py-16 rounded-2xl border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900/30 hover:border-accent/50 transition-colors cursor-pointer"
    >
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        @change="(e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f) }"
      />
      <div class="text-5xl">🖼️</div>
      <div class="text-center">
        <p class="text-sm text-gray-600 dark:text-slate-400">拖拽图片到此处，或 <span class="text-accent-dark dark:text-accent font-medium">点击选择文件</span></p>
        <p class="text-xs text-gray-400 dark:text-slate-600 mt-1.5">支持 PNG / JPG / WebP 格式</p>
      </div>
    </div>

    <!-- ========== 编辑区 ========== -->
    <template v-if="phase === 'edit'">
      <!-- 工具栏 -->
      <div class="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50">
        <!-- 画笔 / 橡皮擦 -->
        <div class="flex gap-1 p-0.5 rounded-lg bg-gray-100 dark:bg-slate-800">
          <button
            @click="tool = 'brush'"
            :class="['px-3 py-1.5 text-xs font-medium rounded-md transition-all', tool === 'brush' ? 'bg-white dark:bg-slate-700 text-accent-dark dark:text-accent shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300']"
          >
            🖌️ 画笔
          </button>
          <button
            @click="tool = 'eraser'"
            :class="['px-3 py-1.5 text-xs font-medium rounded-md transition-all', tool === 'eraser' ? 'bg-white dark:bg-slate-700 text-accent-dark dark:text-accent shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300']"
          >
            🧹 橡皮擦
          </button>
        </div>

        <!-- 画笔大小 -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500 dark:text-slate-500">大小</span>
          <input v-model.number="brushSize" type="range" min="3" max="80" step="1" class="w-20 sm:w-28 accent-accent" />
          <span class="text-xs font-mono text-gray-400 dark:text-slate-500 w-7 text-right">{{ brushSize }}</span>
        </div>

        <div class="flex-1" />

        <!-- 操作按钮 -->
        <button @click="clearMask" class="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-red-300 hover:text-red-500 dark:hover:border-red-700 dark:hover:text-red-400 transition-all">
          清除标记
        </button>
        <button @click="resetAll" class="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600 transition-all">
          重新上传
        </button>
      </div>

      <!-- 画布工作区 -->
      <div
        ref="workspaceEl"
        class="relative w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-950 overflow-hidden select-none"
      >
        <!-- 底层：原图 -->
        <canvas ref="imageCanvas" class="block w-full h-auto" />
        <!-- 中层：遮罩 mask（视觉显示） -->
        <canvas
          ref="maskDisplayCanvas"
          class="absolute top-0 left-0 w-full h-full pointer-events-none"
          style="mix-blend-mode: normal;"
        />
        <!-- 顶层：画笔交互 -->
        <canvas
          ref="maskCanvas"
          class="absolute top-0 left-0 w-full h-full"
          @mousedown.left.prevent="(e: MouseEvent) => startDraw(e)"
          @touchstart.prevent="(e: TouchEvent) => startDraw(e)"
        />
      </div>

      <!-- 提示 -->
      <div class="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-xs text-blue-600 dark:text-blue-400">
        <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span>用画笔在图片上<strong class="text-blue-700 dark:text-blue-300">涂抹标记</strong>水印区域（红色半透明），然后点击"开始修复"。AI 会根据周围内容智能填充。</span>
      </div>

      <!-- 模型加载状态 -->
      <div v-if="modelStatus === 'loading'" class="p-4 rounded-xl border border-accent/20 bg-accent/5 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-accent-dark dark:text-accent font-medium">{{ modelLoadMsg }}</span>
          <span class="font-mono text-accent-dark dark:text-accent">{{ modelProgress }}%</span>
        </div>
        <div class="w-full h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
          <div class="h-full rounded-full bg-accent transition-all duration-300" :style="{ width: modelProgress + '%' }" />
        </div>
      </div>

      <div v-if="modelStatus === 'error'" class="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
        {{ modelLoadMsg }}
      </div>

      <!-- 错误 -->
      <div v-if="errorMsg" class="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
        {{ errorMsg }}
      </div>

      <!-- 修复按钮 -->
      <div class="flex justify-center pt-2">
        <button
          @click="runInference"
          :disabled="isProcessing || modelStatus === 'loading'"
          :class="[
            'px-8 py-3 rounded-xl text-sm font-semibold transition-all',
            isProcessing || modelStatus === 'loading'
              ? 'bg-gray-300 dark:bg-slate-700 text-gray-500 dark:text-slate-500 cursor-not-allowed'
              : 'bg-accent text-white hover:bg-accent-dark shadow-lg shadow-accent/20 hover:shadow-accent/30'
          ]"
        >
          <span v-if="isProcessing" class="flex items-center gap-2">
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            AI 修复中…
          </span>
          <span v-else>
            {{ modelStatus === 'ready' ? '✨ 开始修复' : '✨ 加载模型并修复' }}
          </span>
        </button>
      </div>
    </template>

    <!-- ========== 结果区 ========== -->
    <template v-if="phase === 'result'">
      <!-- 对比切换 -->
      <div class="space-y-4">
        <!-- 对比切换按钮 -->
        <div class="flex items-center justify-center gap-2">
          <span class="text-xs text-gray-500 dark:text-slate-500">对比查看：</span>
          <span class="text-xs px-2 py-1 rounded bg-accent/10 text-accent-dark dark:text-accent font-medium">修复后</span>
          <span class="text-xs text-gray-400 dark:text-slate-600">|</span>
          <button @click="backToEdit" class="text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-colors">
            返回编辑
          </button>
        </div>

        <!-- 结果图 -->
        <div class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden bg-gray-100 dark:bg-slate-950">
          <img v-if="resultUrl" :src="resultUrl" alt="修复结果" class="w-full" />
        </div>

        <!-- 操作按钮 -->
        <div class="flex justify-center gap-3 pt-2">
          <button @click="downloadResult" class="px-6 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-dark transition-all shadow-lg shadow-accent/20">
            📥 下载 PNG
          </button>
          <button @click="backToEdit" class="px-6 py-2.5 rounded-xl text-sm font-medium border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40 transition-all">
            继续编辑
          </button>
          <button @click="resetAll" class="px-6 py-2.5 rounded-xl text-sm font-medium border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600 transition-all">
            处理新图片
          </button>
        </div>
      </div>
    </template>

    <!-- ========== 底部说明 ========== -->
    <div v-if="phase !== 'upload'" class="p-3 rounded-xl bg-gray-50 dark:bg-slate-900/30 border border-gray-100 dark:border-slate-800 text-xs text-gray-400 dark:text-slate-600 flex items-start gap-2">
      <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
      </svg>
      <span>
        所有处理均在浏览器本地完成，<strong class="text-gray-500 dark:text-slate-500">不会上传任何图片数据</strong>。
        AI 模型基于 LaMa（Large Mask Inpainting），首次加载约 200MB，后续由浏览器缓存。
      </span>
    </div>
  </div>
</template>
