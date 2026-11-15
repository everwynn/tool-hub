<script setup lang="ts">
// ============================================================
// Base64Codec — Base64 编解码器
// ============================================================
// 功能：
// 1. 文本 → Base64 编码
// 2. Base64 → 文本解码
// 3. 图片文件 → Base64（拖拽/点击上传）
// 4. Base64 → 图片预览
// 5. URL Safe 模式（+ → - ; / → _）
// 6. 一键复制
// ============================================================

import { ref, computed } from 'vue'

type Mode = 'encode' | 'decode' | 'image'

const mode = ref<Mode>('encode')
const input = ref('')
const urlSafe = ref(false)
const copied = ref(false)
const imageBase64 = ref('')
const imageMime = ref('')
const isDragging = ref(false)

// --- 文本编解码 ---
interface TextResult {
  ok: boolean
  output: string
  error?: string
}

const textResult = computed<TextResult>(() => {
  const raw = input.value
  if (!raw.trim()) return { ok: true, output: '' }

  try {
    if (mode.value === 'encode') {
      // 支持 Unicode（先 encodeURIComponent 转义，再 btoa）
      const encoded = btoa(
        encodeURIComponent(raw).replace(/%([0-9A-F]{2})/g, (_, p1) =>
          String.fromCharCode(parseInt(p1, 16))
        )
      )
      const output = urlSafe.value
        ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
        : encoded
      return { ok: true, output }
    } else {
      // 解码：先还原 URL Safe 字符
      let b64 = raw.trim()
      if (urlSafe.value || b64.includes('-') || b64.includes('_')) {
        b64 = b64.replace(/-/g, '+').replace(/_/g, '/')
        const pad = b64.length % 4
        if (pad) b64 += '='.repeat(4 - pad)
      }
      const decoded = decodeURIComponent(
        atob(b64).split('').map(c =>
          '%' + c.charCodeAt(0).toString(16).padStart(2, '0')
        ).join('')
      )
      return { ok: true, output: decoded }
    }
  } catch (e) {
    return {
      ok: false,
      output: '',
      error: mode.value === 'decode'
        ? 'Base64 解码失败，请检查输入是否为有效的 Base64 字符串'
        : `编码失败：${e instanceof Error ? e.message : String(e)}`,
    }
  }
})

// --- 图片处理 ---
const handleFile = (file: File) => {
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件（jpg/png/gif/svg/webp 等）')
    return
  }
  imageMime.value = file.type
  const reader = new FileReader()
  reader.onload = (e) => {
    const result = e.target?.result as string
    // result 格式: data:image/png;base64,xxxx
    imageBase64.value = result
  }
  reader.readAsDataURL(file)
}

const onDrop = (e: DragEvent) => {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}

const onFileInput = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleFile(file)
}

// 提取纯 Base64（去掉 data:xxx;base64, 前缀）
const pureBase64 = computed(() => {
  if (!imageBase64.value) return ''
  return imageBase64.value.split(',')[1] || ''
})

const copyText = async (text: string) => {
  if (!text) return
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const clear = () => {
  input.value = ''
  imageBase64.value = ''
  imageMime.value = ''
}
</script>

<template>
  <div class="space-y-6">
    <!-- 模式切换 -->
    <div class="flex flex-wrap gap-3 items-center">
      <div class="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        <button
          v-for="m in [{ key: 'encode', label: '🔒 编码' }, { key: 'decode', label: '🔓 解码' }, { key: 'image', label: '🖼️ 图片' }]"
          :key="m.key"
          @click="mode = m.key as Mode; input = ''"
          :class="[
            'px-4 py-2 text-sm font-medium transition-all border-r border-gray-200 dark:border-slate-700 last:border-r-0',
            mode === m.key
              ? 'bg-accent text-white'
              : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
          ]"
        >{{ m.label }}</button>
      </div>

      <!-- URL Safe 开关（文本模式） -->
      <label v-if="mode !== 'image'" class="flex items-center gap-2 cursor-pointer text-sm text-gray-600 dark:text-slate-400">
        <input type="checkbox" v-model="urlSafe" class="sr-only" />
        <div :class="['relative w-9 h-5 rounded-full transition-colors', urlSafe ? 'bg-accent' : 'bg-gray-300 dark:bg-slate-600']">
          <div :class="['absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform', urlSafe ? 'translate-x-4' : 'translate-x-0']"></div>
        </div>
        URL Safe（- _ 代替 + /）
      </label>
    </div>

    <!-- 文本编解码 -->
    <template v-if="mode !== 'image'">
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <!-- 输入 -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500 dark:text-slate-500">
              {{ mode === 'encode' ? '原始文本' : 'Base64 字符串' }}
            </span>
            <button @click="clear" class="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-red-300 hover:text-red-500 transition-all">清空</button>
          </div>
          <textarea
            v-model="input"
            rows="12"
            :placeholder="mode === 'encode' ? '输入要编码的文本，支持中文和 Unicode...' : '粘贴 Base64 字符串进行解码...'"
            class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none leading-relaxed"
            spellcheck="false"
          ></textarea>
          <div class="text-xs text-gray-400 dark:text-slate-600">{{ input.length }} 字符</div>
        </div>

        <!-- 输出 -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500 dark:text-slate-500">
              {{ mode === 'encode' ? 'Base64 编码结果' : '解码文本' }}
            </span>
            <button
              @click="copyText(textResult.output)"
              :class="[
                'text-xs px-2.5 py-1 rounded border transition-all',
                copied
                  ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                  : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent'
              ]"
            >{{ copied ? '已复制' : '复制' }}</button>
          </div>

          <!-- 错误 -->
          <div v-if="!textResult.ok" class="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
            <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            {{ textResult.error }}
          </div>

          <pre class="flex-1 min-h-[280px] px-4 py-3 text-sm font-mono rounded-xl border border-slate-700 bg-slate-900 text-slate-200 overflow-auto whitespace-pre-wrap break-all leading-relaxed"><code>{{ textResult.ok ? (textResult.output || '结果将显示在这里') : '' }}</code></pre>
          <div v-if="textResult.ok && textResult.output" class="text-xs text-gray-400 dark:text-slate-600">{{ textResult.output.length }} 字符</div>
        </div>
      </div>
    </template>

    <!-- 图片模式 -->
    <template v-else>
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <!-- 上传区 -->
        <div>
          <div
            @dragover.prevent="isDragging = true"
            @dragleave="isDragging = false"
            @drop.prevent="onDrop"
            :class="[
              'relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer',
              isDragging
                ? 'border-accent bg-accent/5'
                : 'border-gray-300 dark:border-slate-700 hover:border-accent/50 hover:bg-gray-50 dark:hover:bg-slate-800/40'
            ]"
            @click="($refs.fileInput as HTMLInputElement).click()"
          >
            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileInput" />
            <svg class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <p class="text-sm text-gray-600 dark:text-slate-400">点击选择或拖拽图片到此处</p>
            <p class="text-xs text-gray-400 dark:text-slate-600 mt-1">支持 JPG / PNG / GIF / SVG / WebP</p>
          </div>

          <!-- 预览 -->
          <div v-if="imageBase64" class="mt-4">
            <img :src="imageBase64" alt="预览" class="max-w-full max-h-48 rounded-xl border border-gray-200 dark:border-slate-700 object-contain mx-auto block" />
            <p class="text-xs text-center text-gray-400 dark:text-slate-600 mt-2">{{ imageMime }} · {{ pureBase64.length }} 字符</p>
          </div>
        </div>

        <!-- Base64 输出 -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500 dark:text-slate-500">Base64 结果</span>
            <div class="flex gap-2">
              <button @click="copyText(pureBase64)" :class="['text-xs px-2.5 py-1 rounded border transition-all', copied ? 'border-green-400 text-green-600 dark:text-green-400' : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']">
                {{ copied ? '已复制纯 Base64' : '复制纯 Base64' }}
              </button>
              <button @click="copyText(imageBase64)" class="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">
                复制 Data URI
              </button>
            </div>
          </div>
          <pre class="flex-1 min-h-[280px] px-4 py-3 text-xs font-mono rounded-xl border border-slate-700 bg-slate-900 text-slate-200 overflow-auto whitespace-pre-wrap break-all leading-relaxed"><code>{{ pureBase64 || '上传图片后显示 Base64 编码' }}</code></pre>
        </div>
      </div>
    </template>
  </div>
</template>
