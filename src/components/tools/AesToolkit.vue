<script setup lang="ts">
// ============================================================
// AesToolkit — AES 加解密工具（Web Crypto API，纯前端）
// ============================================================

import { ref, computed, watch } from 'vue'

type AesMode    = 'AES-GCM' | 'AES-CBC'
type KeyLen     = 128 | 192 | 256
type OutputFmt  = 'base64' | 'hex'
type Operation  = 'encrypt' | 'decrypt'

const operation  = ref<Operation>('encrypt')
const aesMode    = ref<AesMode>('AES-GCM')
const keyLen     = ref<KeyLen>(256)
const outputFmt  = ref<OutputFmt>('base64')
const inputText  = ref('')
const keyText    = ref('')        // 密码/密钥（UTF-8 文本或 Hex）
const keyFormat  = ref<'password' | 'hex'>('password')
const result     = ref('')
const errorMsg   = ref('')
const computing  = ref(false)
const copied     = ref(false)

// 帮助函数
const enc = new TextEncoder()
const dec = new TextDecoder()

function buf2hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
function buf2b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function b64toBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return u8.buffer
}
function hexToBuf(hex: string): ArrayBuffer {
  hex = hex.replace(/\s/g, '')
  const u8 = new Uint8Array(hex.length / 2)
  for (let i = 0; i < u8.length; i++) u8[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return u8.buffer
}

// 从密码派生密钥（PBKDF2）
async function deriveKey(password: string, salt: Uint8Array, mode: AesMode, bits: KeyLen): Promise<CryptoKey> {
  const passKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    passKey,
    { name: mode, length: bits },
    false,
    ['encrypt', 'decrypt']
  )
}

// 从 Hex 导入密钥
async function importHexKey(hex: string, mode: AesMode, bits: KeyLen): Promise<CryptoKey> {
  const raw = hexToBuf(hex)
  if (raw.byteLength * 8 !== bits) throw new Error(`密钥长度不匹配：期望 ${bits} bits（${bits / 8} 字节），实际 ${raw.byteLength * 8} bits`)
  return crypto.subtle.importKey('raw', raw, { name: mode, length: bits }, false, ['encrypt', 'decrypt'])
}

// 加密
async function doEncrypt() {
  if (!inputText.value || !keyText.value) return
  computing.value = true; errorMsg.value = ''; result.value = ''
  try {
    const mode = aesMode.value
    const iv = crypto.getRandomValues(new Uint8Array(mode === 'AES-GCM' ? 12 : 16))
    let key: CryptoKey
    let saltPart: Uint8Array | null = null

    if (keyFormat.value === 'password') {
      saltPart = crypto.getRandomValues(new Uint8Array(16))
      key = await deriveKey(keyText.value, saltPart, mode, keyLen.value)
    } else {
      key = await importHexKey(keyText.value.replace(/\s/g, ''), mode, keyLen.value)
    }

    const encOpts: AesCbcParams | AesGcmParams = mode === 'AES-GCM'
      ? { name: 'AES-GCM', iv }
      : { name: 'AES-CBC', iv }

    const cipherBuf = await crypto.subtle.encrypt(encOpts, key, enc.encode(inputText.value))

    // 输出格式：[salt(16)?][iv][ciphertext]
    const parts: Uint8Array[] = []
    if (saltPart) parts.push(saltPart)
    parts.push(iv)
    parts.push(new Uint8Array(cipherBuf))

    const total = parts.reduce((s, p) => s + p.byteLength, 0)
    const combined = new Uint8Array(total)
    let offset = 0
    for (const p of parts) { combined.set(p, offset); offset += p.byteLength }

    result.value = outputFmt.value === 'base64' ? buf2b64(combined.buffer) : buf2hex(combined.buffer)
  } catch (e) {
    errorMsg.value = `加密失败：${e instanceof Error ? e.message : String(e)}`
  } finally { computing.value = false }
}

// 解密
async function doDecrypt() {
  if (!inputText.value || !keyText.value) return
  computing.value = true; errorMsg.value = ''; result.value = ''
  try {
    const mode = aesMode.value
    let rawBuf: ArrayBuffer
    try {
      rawBuf = outputFmt.value === 'base64' ? b64toBuf(inputText.value.trim()) : hexToBuf(inputText.value.trim())
    } catch {
      throw new Error('输入格式错误，请检查 Base64/Hex 是否完整')
    }

    const combined = new Uint8Array(rawBuf)
    const ivLen = mode === 'AES-GCM' ? 12 : 16
    let key: CryptoKey
    let offset = 0

    if (keyFormat.value === 'password') {
      if (combined.byteLength < 16 + ivLen) throw new Error('密文太短，格式可能有误')
      const salt = combined.slice(0, 16); offset = 16
      key = await deriveKey(keyText.value, salt, mode, keyLen.value)
    } else {
      key = await importHexKey(keyText.value.replace(/\s/g, ''), mode, keyLen.value)
    }

    const iv = combined.slice(offset, offset + ivLen)
    const cipherBytes = combined.slice(offset + ivLen)

    const decOpts: AesCbcParams | AesGcmParams = mode === 'AES-GCM'
      ? { name: 'AES-GCM', iv }
      : { name: 'AES-CBC', iv }

    const plainBuf = await crypto.subtle.decrypt(decOpts, key, cipherBytes)
    result.value = dec.decode(plainBuf)
  } catch (e) {
    errorMsg.value = `解密失败：${e instanceof Error ? e.message : String(e)}。请检查密钥/密码是否正确，以及密文格式是否与加密时一致。`
  } finally { computing.value = false }
}

const compute = () => operation.value === 'encrypt' ? doEncrypt() : doDecrypt()

// 生成随机密钥
const genKey = async () => {
  const key = await crypto.subtle.generateKey({ name: aesMode.value, length: keyLen.value }, true, ['encrypt'])
  const raw = await crypto.subtle.exportKey('raw', key)
  keyText.value = buf2hex(raw)
  keyFormat.value = 'hex'
}

const swapOp = () => {
  if (result.value) {
    inputText.value = result.value
    result.value = ''
  }
  operation.value = operation.value === 'encrypt' ? 'decrypt' : 'encrypt'
}

const copy = async () => {
  if (!result.value) return
  await navigator.clipboard.writeText(result.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const modeInfo = computed(() => ({
  'AES-GCM':  { label: 'AES-GCM（推荐）', tip: '认证加密模式，能检测篡改，是现代应用首选（TLS 1.3、iOS 加密）' },
  'AES-CBC':  { label: 'AES-CBC',          tip: '经典模式，兼容性好，但需配合 HMAC 防篡改，不支持并行加密' },
})[aesMode.value])

const keyLenInfo = computed(() => ({
  128: '128 位 · 16 字节，安全、速度快',
  192: '192 位 · 24 字节',
  256: '256 位 · 32 字节，最强，推荐',
})[keyLen.value])

const placeholder = computed(() =>
  operation.value === 'encrypt'
    ? '输入要加密的明文内容...'
    : outputFmt.value === 'base64'
      ? '粘贴 Base64 格式的密文...'
      : '粘贴 Hex 格式的密文...'
)
</script>

<template>
  <div class="space-y-5">
    <!-- 安全声明 -->
    <div class="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-300">
      <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
      <span>所有加解密运算通过浏览器原生 <strong>Web Crypto API</strong> 在本地完成，<strong>密钥和明文不会离开您的浏览器</strong>。请勿用于生产系统的密钥管理，仅供学习和调试。</span>
    </div>

    <!-- 操作选择 + 模式配置 -->
    <div class="flex flex-wrap gap-3 items-start">
      <!-- 加密/解密 -->
      <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
        <button v-for="op in [{ key:'encrypt', label:'🔒 加密' }, { key:'decrypt', label:'🔓 解密' }]" :key="op.key"
          @click="operation = op.key as Operation"
          :class="['px-4 py-2 text-sm font-medium transition-all border-r last:border-r-0 border-gray-200 dark:border-slate-700', operation === op.key ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']"
        >{{ op.label }}</button>
      </div>

      <!-- 模式 -->
      <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
        <button v-for="m in (['AES-GCM', 'AES-CBC'] as AesMode[])" :key="m"
          @click="aesMode = m"
          :class="['px-3 py-2 text-xs font-medium transition-all border-r last:border-r-0 border-gray-200 dark:border-slate-700', aesMode === m ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']"
        >{{ m }}</button>
      </div>

      <!-- 密钥长度 -->
      <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
        <button v-for="l in ([128, 192, 256] as KeyLen[])" :key="l"
          @click="keyLen = l"
          :class="['px-3 py-2 text-xs font-medium transition-all border-r last:border-r-0 border-gray-200 dark:border-slate-700', keyLen === l ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']"
        >{{ l }} bit</button>
      </div>

      <!-- 输出格式 -->
      <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
        <button v-for="f in [{ key:'base64', label:'Base64' }, { key:'hex', label:'Hex' }]" :key="f.key"
          @click="outputFmt = f.key as OutputFmt"
          :class="['px-3 py-2 text-xs font-medium transition-all border-r last:border-r-0 border-gray-200 dark:border-slate-700', outputFmt === f.key ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']"
        >{{ f.label }}</button>
      </div>
    </div>

    <!-- 参数说明 -->
    <div class="flex flex-wrap gap-2 text-xs">
      <span class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
        {{ modeInfo.label }}：{{ modeInfo.tip }}
      </span>
      <span class="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400">{{ keyLenInfo }}</span>
    </div>

    <!-- 密钥输入区 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-slate-200">密钥设置</h3>
        <div class="flex gap-2">
          <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700 text-xs">
            <button @click="keyFormat = 'password'" :class="['px-2.5 py-1 transition-all', keyFormat === 'password' ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-500 dark:text-slate-400 hover:bg-gray-50']">密码派生</button>
            <button @click="keyFormat = 'hex'"      :class="['px-2.5 py-1 transition-all border-l border-gray-200 dark:border-slate-700', keyFormat === 'hex' ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-500 dark:text-slate-400 hover:bg-gray-50']">Hex 密钥</button>
          </div>
          <button @click="genKey" class="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">
            🎲 生成随机密钥
          </button>
        </div>
      </div>
      <input v-model="keyText" type="text" spellcheck="false"
        :placeholder="keyFormat === 'password' ? '输入密码（会通过 PBKDF2 派生密钥，推荐用于记忆型密码）' : `输入 ${keyLen / 8} 字节（${keyLen} bit）Hex 密钥，或点击右上角生成`"
        class="w-full px-4 py-2.5 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
      />
      <div class="text-xs text-gray-400 dark:text-slate-600">
        <template v-if="keyFormat === 'password'">密码模式：使用 PBKDF2（100,000 次迭代）从密码派生 AES 密钥，加密时随机生成 salt 并附在密文头部，解密时自动提取。</template>
        <template v-else>Hex 模式：直接使用 {{ keyLen / 8 }} 字节（{{ keyLen }} 位）原始密钥，<strong class="text-amber-500">加解密双方需使用完全相同的密钥</strong>。</template>
      </div>
    </div>

    <!-- 输入/输出 -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-gray-600 dark:text-slate-400">
            {{ operation === 'encrypt' ? '明文输入' : '密文输入（' + outputFmt + '）' }}
          </span>
          <button @click="inputText = ''" v-if="inputText" class="text-xs text-gray-400 hover:text-red-500 transition-colors">清空</button>
        </div>
        <textarea v-model="inputText" rows="8" :placeholder="placeholder"
          class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none"
          spellcheck="false"></textarea>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-gray-600 dark:text-slate-400">
            {{ operation === 'encrypt' ? '密文输出（' + outputFmt + '）' : '解密结果（明文）' }}
          </span>
          <div class="flex gap-2">
            <button @click="swapOp" :disabled="!result" class="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed">⇄ 互换</button>
            <button @click="copy" :disabled="!result" :class="['text-xs px-2.5 py-1 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed', copied ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']">
              {{ copied ? '已复制' : '复制' }}
            </button>
          </div>
        </div>

        <div v-if="errorMsg" class="text-xs text-red-500 dark:text-red-400 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">{{ errorMsg }}</div>

        <pre class="flex-1 min-h-[200px] px-4 py-3 text-sm font-mono rounded-xl border border-slate-700 bg-slate-900 text-slate-200 overflow-auto whitespace-pre-wrap break-all leading-relaxed"><code>{{ result || (computing ? '处理中...' : '结果将显示在这里') }}</code></pre>
      </div>
    </div>

    <!-- 执行按钮 -->
    <button @click="compute" :disabled="!inputText || !keyText || computing"
      :class="['w-full py-3 rounded-xl text-sm font-semibold transition-all', (!inputText || !keyText || computing) ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed' : 'bg-accent hover:bg-accent-dark text-white shadow-lg shadow-accent/20 hover:shadow-accent/30']"
    >
      <span v-if="computing" class="flex items-center justify-center gap-2">
        <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        处理中...
      </span>
      <span v-else>{{ operation === 'encrypt' ? '🔒 立即加密' : '🔓 立即解密' }}</span>
    </button>
  </div>
</template>
