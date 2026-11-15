<script setup lang="ts">
// ============================================================
// WatermarkRemover — 图片涂抹修复（纯 Canvas 多尺度填充）
// ============================================================
// 功能：
// 1. 上传 / 拖拽图片
// 2. 画笔涂抹要修复的水印 / 杂物区域（mask）
// 3. 多尺度金字塔扩散填充 + 纹理细节回填
// 4. 原图 / 修复后切换 + 下载
// 全程浏览器本地运算，图片不上传
// ============================================================

import { ref, onBeforeUnmount, nextTick } from 'vue'

// ======================== 状态 ========================

type Tool = 'brush' | 'eraser'
type Phase = 'upload' | 'edit' | 'result'

const phase = ref<Phase>('upload')
const imageEl = ref<HTMLImageElement | null>(null)
const imgW = ref(0)
const imgH = ref(0)

const imageCanvas = ref<HTMLCanvasElement | null>(null)
const maskCanvas = ref<HTMLCanvasElement | null>(null)
const workspaceEl = ref<HTMLDivElement | null>(null)

// 离屏 mask（全分辨率，白色 alpha 存储，仅供计算）
let offMask: HTMLCanvasElement | null = null

// 画笔
const tool = ref<Tool>('brush')
const brushSize = ref(20)
const isDrawing = ref(false)
const painted = ref(false)
let lastX = 0
let lastY = 0
let removeGlobalListeners: (() => void) | null = null

// 处理
const isProcessing = ref(false)
const progress = ref(0)
const progressLabel = ref('')
const resultUrl = ref('')
const originalUrl = ref('')
const showOriginal = ref(false)
const errorMsg = ref('')

// ======================== 算法参数 ========================

const MAX_WORK_DIM = 1600      // 计算区最长边上限，超出则降采样填充后贴回
const MASK_MARGIN = 16         // 计算区外扩，给填充算法留取样上下文
const RELAX_COARSE = 32        // 最粗层扩散迭代（决定大区域过渡是否自然）
const RELAX_MID = 10           // 中间层
const RELAX_FINE = 6           // 最细层（过多会丢失细节）
const TEXTURE_STRENGTH = 0.6   // 纹理细节回填强度

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
      originalUrl.value = e.target?.result as string
      imgW.value = img.naturalWidth
      imgH.value = img.naturalHeight
      painted.value = false
      resultUrl.value = ''
      showOriginal.value = false
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

  // 全分辨率
  ic.width = imgW.value
  ic.height = imgH.value
  mc.width = imgW.value
  mc.height = imgH.value

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
    ;[ic, mc].forEach(c => {
      c.style.width = dw + 'px'
      c.style.height = dh + 'px'
    })
    // 给 workspace 设置显式高度，让容器有实际尺寸
    container.style.height = dh + 'px'
    container.style.width = dw + 'px'
  })
}

// ======================== 画笔绘制 ========================

/** 显示尺寸 → 图像像素的缩放比 */
function currentScale() {
  const c = imageCanvas.value
  if (!c || !imgW.value || !c.clientWidth) return 1
  return c.width / c.clientWidth
}

function getCanvasPos(e: MouseEvent | Touch) {
  const mc = maskCanvas.value!
  const rect = mc.getBoundingClientRect()
  const scale = currentScale()
  return {
    x: (e.clientX - rect.left) * scale,
    y: (e.clientY - rect.top) * scale,
  }
}

/** 在可见 canvas 与离屏 mask 上同步描一笔 */
function strokeSegment(
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  erase: boolean,
) {
  const ctx = maskCanvas.value!.getContext('2d')!
  const oCtx = offMask!.getContext('2d')!
  const width = radius * 2

  if (erase) {
    ctx.globalCompositeOperation = 'destination-out'
    oCtx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    oCtx.strokeStyle = 'rgba(0,0,0,1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    oCtx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.45)'
    oCtx.strokeStyle = 'rgba(255, 255, 255, 1)'
  }

  for (const c of [ctx, oCtx]) {
    c.lineWidth = width
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.beginPath()
    c.moveTo(from.x, from.y)
    c.lineTo(to.x, to.y)
    c.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'
  oCtx.globalCompositeOperation = 'source-over'
}

function startDraw(e: MouseEvent | TouchEvent) {
  isDrawing.value = true
  const src = e instanceof TouchEvent ? e.touches[0] : e
  const pos = getCanvasPos(src)
  lastX = pos.x
  lastY = pos.y

  const erase = tool.value === 'eraser'
  if (!erase) painted.value = true

  const r = (brushSize.value * currentScale()) / 2
  // 点一下也要有落笔痕迹
  strokeSegment(pos, { x: pos.x + 0.01, y: pos.y }, r, erase)

  const onMove = (ev: Event) => drawMove(ev as MouseEvent | TouchEvent)
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
  const r = (brushSize.value * currentScale()) / 2

  strokeSegment({ x: lastX, y: lastY }, pos, r, tool.value === 'eraser')
  lastX = pos.x
  lastY = pos.y
}

function clearMask() {
  if (maskCanvas.value) {
    maskCanvas.value.getContext('2d')!.clearRect(0, 0, imgW.value, imgH.value)
  }
  if (offMask) {
    offMask.getContext('2d')!.clearRect(0, 0, offMask.width, offMask.height)
  }
  painted.value = false
}

/** 把离屏 mask 重新画成红色半透明标记（从结果页返回编辑时用） */
function repaintMaskOverlay() {
  if (!offMask || !maskCanvas.value) return
  const tmp = document.createElement('canvas')
  tmp.width = offMask.width
  tmp.height = offMask.height
  const tc = tmp.getContext('2d')!
  tc.drawImage(offMask, 0, 0)
  tc.globalCompositeOperation = 'source-in'
  tc.fillStyle = '#ff3c3c'
  tc.fillRect(0, 0, tmp.width, tmp.height)

  const ctx = maskCanvas.value.getContext('2d')!
  ctx.globalAlpha = 0.45
  ctx.drawImage(tmp, 0, 0)
  ctx.globalAlpha = 1
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

// ======================== 多尺度填充算法 ========================

/** 金字塔单层：rgb 为交织的 0~255 浮点通道，mask 为 1 表示待修复 */
interface Level {
  w: number
  h: number
  rgb: Float32Array
  mask: Uint8Array
}

const DX4 = [-1, 1, 0, 0]
const DY4 = [0, 0, -1, 1]

/** 2×2 下采样：颜色取已知像素均值，mask 取或（膨胀），避免细笔画在粗层丢失 */
function downsample(src: Level): Level {
  const w = Math.max(1, src.w >> 1)
  const h = Math.max(1, src.h >> 1)
  const rgb = new Float32Array(w * h * 3)
  const mask = new Uint8Array(w * h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0
      let ar = 0, ag = 0, ab = 0
      let masked = 0
      for (let dy = 0; dy < 2; dy++) {
        const sy = Math.min(src.h - 1, y * 2 + dy)
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(src.w - 1, x * 2 + dx)
          const si = sy * src.w + sx
          if (src.mask[si]) {
            masked = 1
            continue
          }
          const p = si * 3
          r += src.rgb[p]
          g += src.rgb[p + 1]
          b += src.rgb[p + 2]
          ar += src.rgb[p]
          ag += src.rgb[p + 1]
          ab += src.rgb[p + 2]
          n++
        }
      }
      // 4 个子像素全被涂抹时，用全部子像素均值兜底，避免引入纯黑
      if (n === 0) {
        for (let dy = 0; dy < 2; dy++) {
          const sy = Math.min(src.h - 1, y * 2 + dy)
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(src.w - 1, x * 2 + dx)
            const p = (sy * src.w + sx) * 3
            ar += src.rgb[p]
            ag += src.rgb[p + 1]
            ab += src.rgb[p + 2]
          }
        }
        ar /= 4; ag /= 4; ab /= 4
      } else {
        ar = r / n; ag = g / n; ab = b / n
      }
      const di = y * w + x
      const p = di * 3
      rgb[p] = ar
      rgb[p + 1] = ag
      rgb[p + 2] = ab
      mask[di] = masked
    }
  }
  return { w, h, rgb, mask }
}

/** 该层是否还有未涂抹的参考像素 */
function hasKnown(lv: Level) {
  for (let i = 0; i < lv.mask.length; i++) {
    if (!lv.mask[i]) return true
  }
  return false
}

/** 已知像素的平均色，作为极端情况下的兜底填充色 */
function meanKnownColor(lv: Level): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < lv.mask.length; i++) {
    if (lv.mask[i]) continue
    const p = i * 3
    r += lv.rgb[p]
    g += lv.rgb[p + 1]
    b += lv.rgb[p + 2]
    n++
  }
  if (n === 0) return [128, 128, 128]
  return [r / n, g / n, b / n]
}

/** 用最近的已知颜色初始化待修复区域（BFS 由边界向内逐层推进） */
function seedFromNearest(lv: Level) {
  const { w, h, rgb, mask } = lv
  const total = w * h
  const dist = new Int32Array(total).fill(-1)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0

  for (let i = 0; i < total; i++) {
    if (!mask[i]) {
      dist[i] = 0
      queue[tail++] = i
    }
  }
  if (tail === 0) return // 整层都被标记，无参照可用

  while (head < tail) {
    const i = queue[head++]
    const x = i % w
    const y = (i - x) / w
    for (let k = 0; k < 4; k++) {
      const nx = x + DX4[k]
      const ny = y + DY4[k]
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const ni = ny * w + nx
      if (dist[ni] !== -1) continue
      dist[ni] = 1

      // 已处理邻居按距离反比加权取色，越近权重越大
      let sr = 0, sg = 0, sb = 0, sw = 0
      for (let m = 0; m < 4; m++) {
        const mx = nx + DX4[m]
        const my = ny + DY4[m]
        if (mx < 0 || mx >= w || my < 0 || my >= h) continue
        const mi = my * w + mx
        if (dist[mi] === -1) continue
        const wt = 1 / (dist[mi] + 1)
        const p = mi * 3
        sr += rgb[p] * wt
        sg += rgb[p + 1] * wt
        sb += rgb[p + 2] * wt
        sw += wt
      }
      const p = ni * 3
      if (sw > 0) {
        rgb[p] = sr / sw
        rgb[p + 1] = sg / sw
        rgb[p + 2] = sb / sw
      }
      queue[tail++] = ni
    }
  }
}

/** 雅可比松弛：待修复像素向四邻域均值收敛，已知像素固定不动 */
function relax(lv: Level, iterations: number) {
  const { w, h, mask } = lv
  if (iterations <= 0) return
  let cur = lv.rgb
  let next = new Float32Array(cur.length)

  for (let it = 0; it < iterations; it++) {
    next.set(cur)
    for (let y = 0; y < h; y++) {
      const row = y * w
      for (let x = 0; x < w; x++) {
        const i = row + x
        if (!mask[i]) continue
        let r = 0, g = 0, b = 0, n = 0
        if (x > 0) {
          const p = (i - 1) * 3
          r += cur[p]; g += cur[p + 1]; b += cur[p + 2]; n++
        }
        if (x < w - 1) {
          const p = (i + 1) * 3
          r += cur[p]; g += cur[p + 1]; b += cur[p + 2]; n++
        }
        if (y > 0) {
          const p = (i - w) * 3
          r += cur[p]; g += cur[p + 1]; b += cur[p + 2]; n++
        }
        if (y < h - 1) {
          const p = (i + w) * 3
          r += cur[p]; g += cur[p + 1]; b += cur[p + 2]; n++
        }
        if (n === 0) continue
        const p = i * 3
        next[p] = r / n
        next[p + 1] = g / n
        next[p + 2] = b / n
      }
    }
    const tmp = cur
    cur = next
    next = tmp
  }
  lv.rgb = cur
}

/** 把粗层结果双线性放大，作为细层待修复区域的初值 */
function upsampleMasked(coarse: Level, fine: Level) {
  const { w: cw, h: ch, rgb: cRGB } = coarse
  const { w, h, rgb, mask } = fine

  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, Math.min(ch - 1, (y + 0.5) / 2 - 0.5))
    const y0 = Math.min(ch - 1, Math.floor(fy))
    const y1 = Math.min(ch - 1, y0 + 1)
    const ty = fy - y0
    const row = y * w

    for (let x = 0; x < w; x++) {
      const i = row + x
      if (!mask[i]) continue

      const fx = Math.max(0, Math.min(cw - 1, (x + 0.5) / 2 - 0.5))
      const x0 = Math.min(cw - 1, Math.floor(fx))
      const x1 = Math.min(cw - 1, x0 + 1)
      const tx = fx - x0

      const p00 = (y0 * cw + x0) * 3
      const p10 = (y0 * cw + x1) * 3
      const p01 = (y1 * cw + x0) * 3
      const p11 = (y1 * cw + x1) * 3
      const w00 = (1 - tx) * (1 - ty)
      const w10 = tx * (1 - ty)
      const w01 = (1 - tx) * ty
      const w11 = tx * ty

      const p = i * 3
      rgb[p] = cRGB[p00] * w00 + cRGB[p10] * w10 + cRGB[p01] * w01 + cRGB[p11] * w11
      rgb[p + 1] = cRGB[p00 + 1] * w00 + cRGB[p10 + 1] * w10 + cRGB[p01 + 1] * w01 + cRGB[p11 + 1] * w11
      rgb[p + 2] = cRGB[p00 + 2] * w00 + cRGB[p10 + 2] * w10 + cRGB[p01 + 2] * w01 + cRGB[p11 + 2] * w11
    }
  }
}

/** 纹理细节回填：从已知区域搬运高频分量，避免平滑填充的"塑料感" */
function addTexture(lv: Level, strength: number) {
  const { w, h, rgb, mask } = lv
  const total = w * h
  const len = rgb.length

  // 3×3 均值 → 低频
  const low = new Float32Array(len)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          const p = (ny * w + nx) * 3
          r += rgb[p]
          g += rgb[p + 1]
          b += rgb[p + 2]
          n++
        }
      }
      const p = (y * w + x) * 3
      low[p] = r / n
      low[p + 1] = g / n
      low[p + 2] = b / n
    }
  }

  // 已知像素作为采样源
  const known: number[] = []
  for (let i = 0; i < total; i++) if (!mask[i]) known.push(i)
  if (known.length === 0) return

  // 确定性伪随机，保证同样输入得到同样结果
  let seed = 0x9e3779b9
  const rand = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) / 4294967296
  }

  for (let i = 0; i < total; i++) {
    if (!mask[i]) continue
    const s = known[(rand() * known.length) | 0]
    const sp = s * 3
    const p = i * 3
    for (let c = 0; c < 3; c++) {
      const detail = rgb[sp + c] - low[sp + c]
      const v = rgb[p + c] + detail * strength
      rgb[p + c] = v < 0 ? 0 : v > 255 ? 255 : v
    }
  }
}

// ======================== 修复流程 ========================

function yieldToUI() {
  return new Promise<void>(resolve => setTimeout(resolve, 0))
}

async function runRepair() {
  if (!imageEl.value || !offMask || isProcessing.value) return

  const img = imageEl.value
  const W = img.naturalWidth
  const H = img.naturalHeight

  isProcessing.value = true
  progress.value = 0
  progressLabel.value = '正在读取标记…'
  errorMsg.value = ''
  await nextTick()

  try {
    // ---- 1. 读取 mask，求包围盒 ----
    const maskCtx = offMask.getContext('2d', { willReadFrequently: true })!
    const maskData = maskCtx.getImageData(0, 0, W, H).data
    let minX = W, minY = H, maxX = -1, maxY = -1, count = 0
    for (let y = 0; y < H; y++) {
      const row = y * W
      for (let x = 0; x < W; x++) {
        if (maskData[(row + x) * 4 + 3] > 24) {
          count++
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (count === 0) {
      errorMsg.value = '请先用画笔涂抹要修复的区域'
      isProcessing.value = false
      progressLabel.value = ''
      return
    }

    // 计算区外扩，clamp 到图像范围
    minX = Math.max(0, minX - MASK_MARGIN)
    minY = Math.max(0, minY - MASK_MARGIN)
    maxX = Math.min(W - 1, maxX + MASK_MARGIN)
    maxY = Math.min(H - 1, maxY + MASK_MARGIN)

    const cropW = maxX - minX + 1
    const cropH = maxY - minY + 1
    const workScale = Math.min(1, MAX_WORK_DIM / Math.max(cropW, cropH))
    const ww = Math.max(1, Math.round(cropW * workScale))
    const wh = Math.max(1, Math.round(cropH * workScale))

    progress.value = 12
    progressLabel.value = '正在准备数据…'
    await yieldToUI()

    // ---- 2. 提取计算区（降采样到工作分辨率）----
    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = ww
    srcCanvas.height = wh
    const srcCtx = srcCanvas.getContext('2d')!
    srcCtx.imageSmoothingEnabled = true
    srcCtx.imageSmoothingQuality = 'high'
    srcCtx.drawImage(img, minX, minY, cropW, cropH, 0, 0, ww, wh)
    const srcData = srcCtx.getImageData(0, 0, ww, wh).data

    const mCanvas = document.createElement('canvas')
    mCanvas.width = ww
    mCanvas.height = wh
    const mCtx = mCanvas.getContext('2d', { willReadFrequently: true })!
    // mask 用最近邻缩放，避免细笔画被插值稀释
    mCtx.imageSmoothingEnabled = false
    mCtx.drawImage(offMask, minX, minY, cropW, cropH, 0, 0, ww, wh)
    const mData = mCtx.getImageData(0, 0, ww, wh).data

    const total = ww * wh
    const rgb = new Float32Array(total * 3)
    const mask = new Uint8Array(total)
    let masked = 0
    for (let i = 0; i < total; i++) {
      const p = i * 3
      const q = i * 4
      rgb[p] = srcData[q]
      rgb[p + 1] = srcData[q + 1]
      rgb[p + 2] = srcData[q + 2]
      if (mData[q + 3] > 24) {
        mask[i] = 1
        masked++
      }
    }

    progress.value = 25
    progressLabel.value = '正在构建多尺度模型…'
    await yieldToUI()

    // ---- 3. 构建金字塔 ----
    const levels: Level[] = [{ w: ww, h: wh, rgb, mask }]
    while (Math.min(levels[levels.length - 1].w, levels[levels.length - 1].h) > 6) {
      levels.push(downsample(levels[levels.length - 1]))
    }

    // ---- 4. 由粗到细求解 ----
    // 极粗层可能被 mask 完全覆盖（16px 取样边距被逐级吞掉），
    // 那一层没有任何参考像素，必须从更细、仍有参考的层级开始
    let startIdx = levels.length - 1
    while (startIdx > 0 && !hasKnown(levels[startIdx])) startIdx--
    const startLv = levels[startIdx]
    const totalLevels = startIdx + 1

    progressLabel.value = `正在填充（1/${totalLevels} 层）…`
    if (hasKnown(startLv)) {
      seedFromNearest(startLv)
      relax(startLv, RELAX_COARSE)
    } else {
      // 整张图都被涂抹：用已知像素均值兜底，避免输出黑块
      const [mr, mg, mb] = meanKnownColor(levels[0])
      for (let i = 0; i < startLv.w * startLv.h; i++) {
        if (!startLv.mask[i]) continue
        const p = i * 3
        startLv.rgb[p] = mr
        startLv.rgb[p + 1] = mg
        startLv.rgb[p + 2] = mb
      }
    }
    await yieldToUI()

    for (let li = startIdx - 1; li >= 0; li--) {
      upsampleMasked(levels[li + 1], levels[li])
      relax(levels[li], li === 0 ? RELAX_FINE : RELAX_MID)
      progress.value = 25 + Math.round(((startIdx - li) / totalLevels) * 55)
      progressLabel.value = `正在填充（${startIdx - li + 1}/${totalLevels} 层）…`
      await yieldToUI()
    }

    // ---- 5. 纹理细节回填 ----
    const fine = levels[0]
    if (masked > 0) addTexture(fine, TEXTURE_STRENGTH)

    progress.value = 88
    progressLabel.value = '正在合成结果…'
    await yieldToUI()

    // ---- 6. 合成回原图 ----
    const fixCanvas = document.createElement('canvas')
    fixCanvas.width = fine.w
    fixCanvas.height = fine.h
    const fixCtx = fixCanvas.getContext('2d')!
    const fixImage = fixCtx.createImageData(fine.w, fine.h)
    const fixPx = fixImage.data
    for (let i = 0; i < fine.w * fine.h; i++) {
      const p = i * 3
      const q = i * 4
      fixPx[q] = fine.rgb[p]
      fixPx[q + 1] = fine.rgb[p + 1]
      fixPx[q + 2] = fine.rgb[p + 2]
      fixPx[q + 3] = 255
    }
    fixCtx.putImageData(fixImage, 0, 0)

    // 修复层：放大到 bbox 尺寸并放到原图对应位置
    const layer = document.createElement('canvas')
    layer.width = W
    layer.height = H
    const lCtx = layer.getContext('2d')!
    lCtx.imageSmoothingEnabled = true
    lCtx.imageSmoothingQuality = 'high'
    lCtx.drawImage(fixCanvas, 0, 0, fine.w, fine.h, minX, minY, cropW, cropH)

    // 羽化遮罩：mask 轻微模糊，让修复区与原图过渡自然
    const alphaCanvas = document.createElement('canvas')
    alphaCanvas.width = W
    alphaCanvas.height = H
    const aCtx = alphaCanvas.getContext('2d')!
    aCtx.imageSmoothingEnabled = true
    aCtx.filter = 'blur(1.5px)'
    aCtx.drawImage(offMask, minX, minY, cropW, cropH, minX, minY, cropW, cropH)

    // 按羽化遮罩裁剪修复层
    lCtx.globalCompositeOperation = 'destination-in'
    lCtx.drawImage(alphaCanvas, 0, 0)
    lCtx.globalCompositeOperation = 'source-over'

    // 叠加到原图
    const resultCanvas = document.createElement('canvas')
    resultCanvas.width = W
    resultCanvas.height = H
    const rCtx = resultCanvas.getContext('2d')!
    rCtx.drawImage(img, 0, 0)
    rCtx.drawImage(layer, 0, 0)

    resultUrl.value = resultCanvas.toDataURL('image/png')
    showOriginal.value = false
    progress.value = 100
    progressLabel.value = ''
    phase.value = 'result'
  } catch (err) {
    errorMsg.value = `修复失败：${err instanceof Error ? err.message : String(err)}`
  } finally {
    isProcessing.value = false
  }
}

// ======================== 下载 / 重置 ========================

function downloadResult() {
  if (!resultUrl.value) return
  const a = document.createElement('a')
  a.href = resultUrl.value
  a.download = `image-repaired-${Date.now()}.png`
  a.click()
}

function resetAll() {
  phase.value = 'upload'
  imageEl.value = null
  resultUrl.value = ''
  originalUrl.value = ''
  showOriginal.value = false
  errorMsg.value = ''
  progress.value = 0
  progressLabel.value = ''
  painted.value = false
  clearMask()
}

async function backToEdit() {
  const savedMask = offMask
  phase.value = 'edit'
  resultUrl.value = ''
  showOriginal.value = false
  await nextTick()
  // 编辑区 canvas 会随 v-if 重建，需要重新初始化并恢复原有标记
  if (!imageEl.value) return
  initCanvases()
  offMask = savedMask
  repaintMaskOverlay()
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
        <!-- 顶层：遮罩显示 + 画笔交互 -->
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
        <span>用画笔<strong class="text-blue-700 dark:text-blue-300">涂抹标记</strong>水印或杂物区域（红色半透明），尽量贴合边缘，然后点击"开始修复"。程序会用周围像素做多尺度填充。</span>
      </div>

      <!-- 错误 -->
      <div v-if="errorMsg" class="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
        {{ errorMsg }}
      </div>

      <!-- 进度 -->
      <div v-if="isProcessing" class="p-4 rounded-xl border border-accent/20 bg-accent/5 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-accent-dark dark:text-accent font-medium">{{ progressLabel || '处理中…' }}</span>
          <span class="font-mono text-accent-dark dark:text-accent">{{ progress }}%</span>
        </div>
        <div class="w-full h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
          <div class="h-full rounded-full bg-accent transition-all duration-300" :style="{ width: progress + '%' }" />
        </div>
      </div>

      <!-- 修复按钮 -->
      <div class="flex justify-center pt-2">
        <button
          @click="runRepair"
          :disabled="isProcessing"
          :class="[
            'px-8 py-3 rounded-xl text-sm font-semibold transition-all',
            isProcessing
              ? 'bg-gray-300 dark:bg-slate-700 text-gray-500 dark:text-slate-500 cursor-not-allowed'
              : 'bg-accent text-white hover:bg-accent-dark shadow-lg shadow-accent/20 hover:shadow-accent/30'
          ]"
        >
          <span v-if="isProcessing" class="flex items-center gap-2">
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            正在修复…
          </span>
          <span v-else>✨ 开始修复</span>
        </button>
      </div>
    </template>

    <!-- ========== 结果区 ========== -->
    <template v-if="phase === 'result'">
      <div class="space-y-4">
        <!-- 对比切换 -->
        <div class="flex items-center justify-center gap-2">
          <span class="text-xs text-gray-500 dark:text-slate-500">对比查看：</span>
          <button
            @click="showOriginal = false"
            :class="['text-xs px-2 py-1 rounded font-medium transition-colors', !showOriginal ? 'bg-accent/10 text-accent-dark dark:text-accent' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800']"
          >修复后</button>
          <span class="text-xs text-gray-400 dark:text-slate-600">|</span>
          <button
            @click="showOriginal = true"
            :class="['text-xs px-2 py-1 rounded font-medium transition-colors', showOriginal ? 'bg-accent/10 text-accent-dark dark:text-accent' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800']"
          >原图</button>
        </div>

        <!-- 结果图 -->
        <div class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden bg-gray-100 dark:bg-slate-950">
          <img v-if="resultUrl" :src="showOriginal ? originalUrl : resultUrl" :alt="showOriginal ? '原图' : '修复结果'" class="w-full" />
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
        算法采用多尺度扩散填充：对纯色、渐变背景效果好；大面积涂抹在复杂纹理上会偏平滑，建议小范围精确涂抹。
      </span>
    </div>
  </div>
</template>
