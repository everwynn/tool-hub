<script setup lang="ts">
// ============================================================
// HashCalculator — 哈希计算器 + HMAC 计算（Web Crypto API）
// ============================================================

import { ref, watch, computed } from 'vue'

// ===== 共用 =====
type Tab = 'hash' | 'hmac'
const activeTab = ref<Tab>('hash')
const uppercase = ref(false)
const copied    = ref<string>('')

const formatHash = (h: string) => uppercase.value ? h.toUpperCase() : h
const copyText = async (text: string, key: string) => {
  await navigator.clipboard.writeText(text)
  copied.value = key
  setTimeout(() => { copied.value = '' }, 2000)
}

// ===== MD5 纯 JS 实现（Web Crypto 不支持 MD5）=====
function md5(input: string): string {
  function safeAdd(x: number, y: number) { const lsw = (x & 0xFFFF) + (y & 0xFFFF); return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xFFFF) }
  function bitRotateLeft(num: number, cnt: number) { return (num << cnt) | (num >>> (32 - cnt)) }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number) { return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b) }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return md5cmn((b & c) | (~b & d), a, b, x, s, t) }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t) }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return md5cmn(b ^ c ^ d, a, b, x, s, t) }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return md5cmn(c ^ (b | ~d), a, b, x, s, t) }
  function str2binl(str: string) {
    const bin: number[] = []
    const mask = (1 << 8) - 1
    for (let i = 0; i < str.length * 8; i += 8) bin[i >> 5] |= (str.charCodeAt(i / 8) & mask) << (i % 32)
    return bin
  }
  function binl2hex(binarray: number[]) {
    const hexTab = '0123456789abcdef'
    let str = ''
    for (let i = 0; i < binarray.length * 4; i++) str += hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8 + 4)) & 0xF) + hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8)) & 0xF)
    return str
  }
  function binlMD5(x: number[], len: number) {
    x[len >> 5] |= 0x80 << (len % 32); x[(((len + 64) >>> 9) << 4) + 14] = len
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878
    for (let i = 0; i < x.length; i += 16) {
      const [oa, ob, oc, od] = [a, b, c, d]
      a = md5ff(a,b,c,d,x[i],7,-680876936); d = md5ff(d,a,b,c,x[i+1],12,-389564586); c = md5ff(c,d,a,b,x[i+2],17,606105819); b = md5ff(b,c,d,a,x[i+3],22,-1044525330)
      a = md5ff(a,b,c,d,x[i+4],7,-176418897); d = md5ff(d,a,b,c,x[i+5],12,1200080426); c = md5ff(c,d,a,b,x[i+6],17,-1473231341); b = md5ff(b,c,d,a,x[i+7],22,-45705983)
      a = md5ff(a,b,c,d,x[i+8],7,1770035416); d = md5ff(d,a,b,c,x[i+9],12,-1958414417); c = md5ff(c,d,a,b,x[i+10],17,-42063); b = md5ff(b,c,d,a,x[i+11],22,-1990404162)
      a = md5ff(a,b,c,d,x[i+12],7,1804603682); d = md5ff(d,a,b,c,x[i+13],12,-40341101); c = md5ff(c,d,a,b,x[i+14],17,-1502002290); b = md5ff(b,c,d,a,x[i+15],22,1236535329)
      a = md5gg(a,b,c,d,x[i+1],5,-165796510); d = md5gg(d,a,b,c,x[i+6],9,-1069501632); c = md5gg(c,d,a,b,x[i+11],14,643717713); b = md5gg(b,c,d,a,x[i],20,-373897302)
      a = md5gg(a,b,c,d,x[i+5],5,-701558691); d = md5gg(d,a,b,c,x[i+10],9,38016083); c = md5gg(c,d,a,b,x[i+15],14,-660478335); b = md5gg(b,c,d,a,x[i+4],20,-405537848)
      a = md5gg(a,b,c,d,x[i+9],5,568446438); d = md5gg(d,a,b,c,x[i+14],9,-1019803690); c = md5gg(c,d,a,b,x[i+3],14,-187363961); b = md5gg(b,c,d,a,x[i+8],20,1163531501)
      a = md5gg(a,b,c,d,x[i+13],5,-1444681467); d = md5gg(d,a,b,c,x[i+2],9,-51403784); c = md5gg(c,d,a,b,x[i+7],14,1735328473); b = md5gg(b,c,d,a,x[i+12],20,-1926607734)
      a = md5hh(a,b,c,d,x[i+5],4,-378558); d = md5hh(d,a,b,c,x[i+8],11,-2022574463); c = md5hh(c,d,a,b,x[i+11],16,1839030562); b = md5hh(b,c,d,a,x[i+14],23,-35309556)
      a = md5hh(a,b,c,d,x[i+1],4,-1530992060); d = md5hh(d,a,b,c,x[i+4],11,1272893353); c = md5hh(c,d,a,b,x[i+7],16,-155497632); b = md5hh(b,c,d,a,x[i+10],23,-1094730640)
      a = md5hh(a,b,c,d,x[i+13],4,681279174); d = md5hh(d,a,b,c,x[i],11,-358537222); c = md5hh(c,d,a,b,x[i+3],16,-722521979); b = md5hh(b,c,d,a,x[i+6],23,76029189)
      a = md5hh(a,b,c,d,x[i+9],4,-640364487); d = md5hh(d,a,b,c,x[i+12],11,-421815835); c = md5hh(c,d,a,b,x[i+15],16,530742520); b = md5hh(b,c,d,a,x[i+2],23,-995338651)
      a = md5ii(a,b,c,d,x[i],6,-198630844); d = md5ii(d,a,b,c,x[i+7],10,1126891415); c = md5ii(c,d,a,b,x[i+14],15,-1416354905); b = md5ii(b,c,d,a,x[i+5],21,-57434055)
      a = md5ii(a,b,c,d,x[i+12],6,1700485571); d = md5ii(d,a,b,c,x[i+3],10,-1894986606); c = md5ii(c,d,a,b,x[i+10],15,-1051523); b = md5ii(b,c,d,a,x[i+1],21,-2054922799)
      a = md5ii(a,b,c,d,x[i+8],6,1873313359); d = md5ii(d,a,b,c,x[i+15],10,-30611744); c = md5ii(c,d,a,b,x[i+6],15,-1560198380); b = md5ii(b,c,d,a,x[i+13],21,1309151649)
      a = md5ii(a,b,c,d,x[i+4],6,-145523070); d = md5ii(d,a,b,c,x[i+11],10,-1120210379); c = md5ii(c,d,a,b,x[i+2],15,718787259); b = md5ii(b,c,d,a,x[i+9],21,-343485551)
      a = safeAdd(a,oa); b = safeAdd(b,ob); c = safeAdd(c,oc); d = safeAdd(d,od)
    }
    return [a, b, c, d]
  }
  const binaryStr = unescape(encodeURIComponent(input))
  return binl2hex(binlMD5(str2binl(binaryStr), binaryStr.length * 8))
}

async function shaHash(algo: string, data: BufferSource): Promise<string> {
  const buf = await crypto.subtle.digest(algo, data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const textEncoder = new TextEncoder()

// ===== Tab 1：哈希计算 =====
type Algorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'

const hashInput    = ref('')
const hashInputMode = ref<'text' | 'file'>('text')
const hashResults  = ref<Record<Algorithm, string>>({} as Record<Algorithm, string>)
const hashComputing = ref(false)
const fileInfo     = ref<{ name: string; size: string } | null>(null)

const algorithms: { key: Algorithm; label: string; bits: number; note?: string }[] = [
  { key: 'MD5',     label: 'MD5',     bits: 128, note: '已不推荐用于安全场景，仅作校验' },
  { key: 'SHA-1',   label: 'SHA-1',   bits: 160, note: '已被证明不安全，不推荐' },
  { key: 'SHA-256', label: 'SHA-256', bits: 256 },
  { key: 'SHA-384', label: 'SHA-384', bits: 384 },
  { key: 'SHA-512', label: 'SHA-512', bits: 512 },
]

async function computeHash() {
  if (hashInputMode.value === 'text' && !hashInput.value.trim()) {
    hashResults.value = {} as Record<Algorithm, string>; return
  }
  hashComputing.value = true
  try {
    const buf = textEncoder.encode(hashInput.value)
    const [sha1, sha256, sha384, sha512] = await Promise.all([
      shaHash('SHA-1', buf), shaHash('SHA-256', buf), shaHash('SHA-384', buf), shaHash('SHA-512', buf),
    ])
    hashResults.value = { 'MD5': md5(hashInput.value), 'SHA-1': sha1, 'SHA-256': sha256, 'SHA-384': sha384, 'SHA-512': sha512 }
  } finally { hashComputing.value = false }
}

async function computeHashFromBuffer(buffer: ArrayBuffer, rawText?: string) {
  hashComputing.value = true
  try {
    const u8 = new Uint8Array(buffer)
    const [sha1, sha256, sha384, sha512] = await Promise.all([
      shaHash('SHA-1', u8), shaHash('SHA-256', u8), shaHash('SHA-384', u8), shaHash('SHA-512', u8),
    ])
    hashResults.value = { 'MD5': md5(rawText ?? new TextDecoder().decode(u8)), 'SHA-1': sha1, 'SHA-256': sha256, 'SHA-384': sha384, 'SHA-512': sha512 }
  } finally { hashComputing.value = false }
}

watch(hashInput, () => { if (hashInputMode.value === 'text') computeHash() })

const handleFile = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileInfo.value = {
    name: file.name,
    size: file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : `${(file.size / 1024).toFixed(1)} KB`,
  }
  const reader = new FileReader()
  reader.onload = (ev) => { if (ev.target?.result instanceof ArrayBuffer) computeHashFromBuffer(ev.target.result) }
  reader.readAsArrayBuffer(file)
}

const byteLength = computed(() => {
  if (typeof TextEncoder === 'undefined') return 0
  return new TextEncoder().encode(hashInput.value).length
})

const switchHashMode = (m: 'text' | 'file') => {
  hashInputMode.value = m; hashResults.value = {} as Record<Algorithm, string>; fileInfo.value = null; hashInput.value = ''
}

// ===== Tab 2：HMAC 计算 =====
type HmacAlgo = 'SHA-256' | 'SHA-384' | 'SHA-512' | 'SHA-1'

const hmacMessage    = ref('')
const hmacKey        = ref('')
const hmacAlgo       = ref<HmacAlgo>('SHA-256')
const hmacKeyFormat  = ref<'utf8' | 'hex'>('utf8')
const hmacResult     = ref('')
const hmacComputing  = ref(false)
const hmacError      = ref('')

const hmacAlgos: { key: HmacAlgo; label: string; note?: string }[] = [
  { key: 'SHA-256', label: 'HMAC-SHA-256' },
  { key: 'SHA-384', label: 'HMAC-SHA-384' },
  { key: 'SHA-512', label: 'HMAC-SHA-512' },
  { key: 'SHA-1',   label: 'HMAC-SHA-1', note: '不推荐' },
]

// 场景说明
const hmacUseCases = [
  { icon: '🔌', title: 'API 签名验证', desc: '调用 Webhook / 第三方接口时，用密钥对请求体签名，防止篡改' },
  { icon: '🔑', title: 'JWT 签名（HS256）', desc: 'JWT 的 HS256/HS384/HS512 本质是 HMAC，可用此工具验证签名' },
  { icon: '📦', title: '文件完整性', desc: '发布软件时附上 HMAC 值，下载方用相同密钥验证文件未被篡改' },
]

function hexToUint8(hex: string): Uint8Array {
  hex = hex.replace(/\s/g, '')
  if (hex.length % 2 !== 0) hex = '0' + hex
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return arr
}

async function computeHmac() {
  if (!hmacMessage.value || !hmacKey.value) { hmacResult.value = ''; return }
  hmacComputing.value = true; hmacError.value = ''
  try {
    let keyBytes: BufferSource
    if (hmacKeyFormat.value === 'hex') {
      if (!/^[0-9a-fA-F\s]+$/.test(hmacKey.value)) throw new Error('密钥包含非十六进制字符')
      keyBytes = hexToUint8(hmacKey.value)
    } else {
      keyBytes = textEncoder.encode(hmacKey.value)
    }
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBytes,
      { name: 'HMAC', hash: { name: hmacAlgo.value } },
      false, ['sign']
    )
    const msgBuf = textEncoder.encode(hmacMessage.value)
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, msgBuf)
    hmacResult.value = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch (e) {
    hmacError.value = e instanceof Error ? e.message : String(e)
    hmacResult.value = ''
  } finally { hmacComputing.value = false }
}

watch([hmacMessage, hmacKey, hmacAlgo, hmacKeyFormat], computeHmac)

// 预设示例
const loadHmacExample = () => {
  hmacMessage.value = '{"order_id":"12345","amount":99.9,"currency":"CNY"}'
  hmacKey.value = 'my-secret-key-2024'
  hmacAlgo.value = 'SHA-256'
  hmacKeyFormat.value = 'utf8'
}
</script>

<template>
  <div class="space-y-5">
    <!-- 安全提示 -->
    <div class="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-300">
      <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
      <span>所有运算完全在浏览器本地完成（Web Crypto API），<strong>不会上传任何数据到服务器</strong>。</span>
    </div>

    <!-- Tab 切换 -->
    <div class="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-slate-800/60 w-fit">
      <button
        v-for="tab in [{ key: 'hash', label: '#️⃣ 哈希计算' }, { key: 'hmac', label: '🔐 HMAC 计算' }]"
        :key="tab.key"
        @click="activeTab = tab.key as Tab"
        :class="['px-4 py-2 text-sm font-medium rounded-lg transition-all', activeTab === tab.key ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200']"
      >{{ tab.label }}</button>
    </div>

    <!-- ======================== 哈希计算 Tab ======================== -->
    <div v-if="activeTab === 'hash'" class="space-y-5">
      <!-- 输入模式 + 选项 -->
      <div class="flex gap-2 flex-wrap">
        <button @click="switchHashMode('text')" :class="['px-4 py-2 text-sm font-medium rounded-xl border transition-all', hashInputMode === 'text' ? 'bg-accent text-white border-accent' : 'bg-white dark:bg-slate-900/50 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40']">
          ✏️ 文本输入
        </button>
        <button @click="switchHashMode('file')" :class="['px-4 py-2 text-sm font-medium rounded-xl border transition-all', hashInputMode === 'file' ? 'bg-accent text-white border-accent' : 'bg-white dark:bg-slate-900/50 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40']">
          📁 文件校验
        </button>
        <div class="ml-auto flex items-center gap-2">
          <label class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400 cursor-pointer select-none">
            <input type="checkbox" v-model="uppercase" class="w-3.5 h-3.5 accent-accent" />
            大写输出
          </label>
        </div>
      </div>

      <!-- 文本输入 -->
      <div v-if="hashInputMode === 'text'">
        <textarea v-model="hashInput" rows="5" placeholder="在此输入要计算哈希的文本..."
          class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none"
          spellcheck="false"></textarea>
        <div class="flex justify-between mt-1 text-xs text-gray-400 dark:text-slate-600">
          <span>{{ hashInput.length }} 字符 · {{ byteLength }} 字节</span>
          <button @click="hashInput = ''" v-if="hashInput" class="hover:text-gray-600 dark:hover:text-slate-400">清空</button>
        </div>
      </div>

      <!-- 文件上传 -->
      <div v-else>
        <label class="flex flex-col items-center justify-center gap-3 px-6 py-10 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900/30 hover:border-accent/50 cursor-pointer transition-colors">
          <input type="file" class="sr-only" @change="handleFile" />
          <svg class="w-10 h-10 text-gray-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div class="text-center">
            <div v-if="fileInfo" class="text-sm font-medium text-gray-700 dark:text-slate-300">{{ fileInfo.name }}</div>
            <div v-if="fileInfo" class="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{{ fileInfo.size }}</div>
            <div v-else class="text-sm text-gray-400 dark:text-slate-500">点击选择文件，或拖拽文件到此处</div>
          </div>
        </label>
      </div>

      <div v-if="hashComputing" class="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
        <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        计算中...
      </div>

      <div v-if="Object.keys(hashResults).length" class="space-y-3">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-slate-200">计算结果</h3>
        <div v-for="algo in algorithms" :key="algo.key" class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-4 py-3">
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold font-mono text-gray-900 dark:text-white">{{ algo.label }}</span>
              <span class="text-xs text-gray-400 dark:text-slate-600">{{ algo.bits }} bits</span>
              <span v-if="algo.note" class="text-xs text-amber-500 dark:text-amber-400">⚠ {{ algo.note }}</span>
            </div>
            <button @click="copyText(formatHash(hashResults[algo.key]), algo.key)"
              :class="['text-xs px-2.5 py-1 rounded-lg border transition-all flex-shrink-0 ml-2', copied === algo.key ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']"
            >{{ copied === algo.key ? '已复制' : '复制' }}</button>
          </div>
          <code class="block text-xs font-mono text-gray-600 dark:text-slate-400 break-all leading-relaxed">{{ formatHash(hashResults[algo.key]) }}</code>
        </div>
      </div>
      <div v-else-if="!hashComputing" class="py-8 text-center text-gray-300 dark:text-slate-700 text-sm">
        {{ hashInputMode === 'text' ? '在上方输入文本后自动计算' : '选择文件后自动计算所有哈希值' }}
      </div>
    </div>

    <!-- ======================== HMAC 计算 Tab ======================== -->
    <div v-else class="space-y-5">
      <!-- 使用场景说明 -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div v-for="uc in hmacUseCases" :key="uc.title" class="px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900/40 border border-gray-200 dark:border-slate-700">
          <div class="text-lg mb-1">{{ uc.icon }}</div>
          <div class="text-sm font-medium text-gray-700 dark:text-slate-300 mb-0.5">{{ uc.title }}</div>
          <div class="text-xs text-gray-400 dark:text-slate-500 leading-relaxed">{{ uc.desc }}</div>
        </div>
      </div>

      <!-- 算法选择 + 密钥格式 + 示例 -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
          <button v-for="a in hmacAlgos" :key="a.key" @click="hmacAlgo = a.key"
            :class="['px-3 py-2 text-xs font-medium transition-all border-r border-gray-200 dark:border-slate-700 last:border-r-0', hmacAlgo === a.key ? 'bg-accent text-white' : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800']"
          >
            {{ a.label }}
            <span v-if="a.note" class="ml-1 text-amber-300">⚠</span>
          </button>
        </div>
        <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <span>密钥格式：</span>
          <button v-for="f in [{ key: 'utf8', label: 'UTF-8 文本' }, { key: 'hex', label: 'Hex 十六进制' }]" :key="f.key"
            @click="hmacKeyFormat = f.key as 'utf8' | 'hex'"
            :class="['px-2.5 py-1 rounded-lg border transition-all', hmacKeyFormat === f.key ? 'bg-accent text-white border-accent' : 'border-gray-200 dark:border-slate-700 hover:border-accent/40']"
          >{{ f.label }}</button>
        </div>
        <button @click="loadHmacExample" class="ml-auto text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">
          载入示例
        </button>
      </div>

      <!-- 输入区 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">待签名消息（Message）</label>
          <textarea v-model="hmacMessage" rows="6" placeholder="输入要签名的消息内容..."
            class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none"
            spellcheck="false"></textarea>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">
            密钥（Secret Key）
            <span class="text-gray-400 dark:text-slate-600 font-normal ml-1">{{ hmacKeyFormat === 'hex' ? '十六进制格式，如 deadbeef' : 'UTF-8 字符串' }}</span>
          </label>
          <textarea v-model="hmacKey" rows="6" :placeholder="hmacKeyFormat === 'hex' ? '输入十六进制密钥，如：deadbeef1234...' : '输入密钥字符串，如：my-secret-key'"
            class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none"
            spellcheck="false"></textarea>
        </div>
      </div>

      <!-- 错误 -->
      <div v-if="hmacError" class="text-xs text-red-500 dark:text-red-400 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        {{ hmacError }}
      </div>

      <!-- 计算中 -->
      <div v-if="hmacComputing" class="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
        <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        计算中...
      </div>

      <!-- 结果 -->
      <div v-if="hmacResult" class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-4 py-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold font-mono text-gray-900 dark:text-white">HMAC-{{ hmacAlgo }}</span>
            <span class="text-xs text-gray-400 dark:text-slate-600">签名结果</span>
          </div>
          <div class="flex gap-2">
            <button @click="uppercase = !uppercase" :class="['text-xs px-2.5 py-1 rounded-lg border transition-all', uppercase ? 'border-accent text-accent-dark dark:text-accent bg-accent/5' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-accent/50']">
              {{ uppercase ? 'ABC' : 'abc' }}
            </button>
            <button @click="copyText(formatHash(hmacResult), 'hmac')"
              :class="['text-xs px-2.5 py-1 rounded-lg border transition-all', copied === 'hmac' ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']"
            >{{ copied === 'hmac' ? '已复制' : '复制' }}</button>
          </div>
        </div>
        <code class="block text-sm font-mono text-gray-700 dark:text-slate-300 break-all leading-relaxed bg-gray-50 dark:bg-slate-900/50 px-3 py-2.5 rounded-lg">{{ formatHash(hmacResult) }}</code>

        <!-- 长度说明 -->
        <div class="flex gap-4 text-xs text-gray-400 dark:text-slate-600">
          <span>长度：{{ hmacResult.length / 2 }} 字节 / {{ hmacResult.length * 4 }} bits</span>
          <span>Hex 字符数：{{ hmacResult.length }}</span>
        </div>
      </div>

      <div v-else-if="!hmacComputing && !hmacError" class="py-8 text-center text-gray-300 dark:text-slate-700 text-sm">
        填写消息和密钥后自动计算 HMAC 签名
      </div>

      <!-- HMAC 原理说明 -->
      <div class="mt-2 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
        <strong>HMAC 原理：</strong>HMAC(K, M) = Hash((K ⊕ opad) ‖ Hash((K ⊕ ipad) ‖ M))，密钥参与哈希运算，相同消息不同密钥输出完全不同。与普通哈希的核心区别是<strong>需要密钥</strong>，不知道密钥就无法伪造签名。
      </div>
    </div>
  </div>
</template>
