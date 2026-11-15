<script setup lang="ts">
// ============================================================
// JwtDecoder — JWT Token 解码器 + 签名验证（Web Crypto API）
// ============================================================

import { ref, computed } from 'vue'

type Tab = 'decode' | 'verify'
const activeTab = ref<Tab>('decode')

const input = ref('')

// Base64url 解码
const decodeBase64Url = (str: string): string => {
  const pad = str.length % 4
  const padded = pad ? str + '='.repeat(4 - pad) : str
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(
      atob(b64).split('').map(c =>
        '%' + c.charCodeAt(0).toString(16).padStart(2, '0')
      ).join('')
    )
  } catch { return '' }
}

interface DecodeResult {
  valid: boolean
  error?: string
  headerRaw: string
  payloadRaw: string
  signatureRaw: string
  header: Record<string, unknown> | null
  payload: Record<string, unknown> | null
}

const result = computed<DecodeResult>(() => {
  const token = input.value.trim()
  if (!token) return { valid: false, headerRaw: '', payloadRaw: '', signatureRaw: '', header: null, payload: null }
  const parts = token.split('.')
  if (parts.length !== 3) {
    return { valid: false, error: 'JWT 格式错误：应包含三段（header.payload.signature），以 "." 分隔', headerRaw: parts[0] || '', payloadRaw: parts[1] || '', signatureRaw: parts[2] || '', header: null, payload: null }
  }
  const [headerRaw, payloadRaw, signatureRaw] = parts
  const headerStr = decodeBase64Url(headerRaw)
  const payloadStr = decodeBase64Url(payloadRaw)
  if (!headerStr || !payloadStr) {
    return { valid: false, error: 'Base64 解码失败，Token 可能已损坏', headerRaw, payloadRaw, signatureRaw, header: null, payload: null }
  }
  try {
    const header = JSON.parse(headerStr)
    const payload = JSON.parse(payloadStr)
    return { valid: true, headerRaw, payloadRaw, signatureRaw, header, payload }
  } catch {
    return { valid: false, error: 'JSON 解析失败，Token 数据可能已损坏', headerRaw, payloadRaw, signatureRaw, header: null, payload: null }
  }
})

const formatTime = (ts: unknown): string => {
  if (typeof ts !== 'number') return String(ts)
  const d = new Date(ts * 1000)
  return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

const expireStatus = computed(() => {
  const payload = result.value.payload
  if (!payload || typeof payload.exp !== 'number') return null
  const now = Math.floor(Date.now() / 1000)
  const exp = payload.exp as number
  if (now > exp) return { type: 'expired', label: '已过期', color: 'text-red-500 dark:text-red-400' }
  if (exp - now < 3600) return { type: 'warning', label: '即将过期（1小时内）', color: 'text-amber-500 dark:text-amber-400' }
  return { type: 'valid', label: '有效', color: 'text-green-500 dark:text-green-400' }
})

const prettyJson = (obj: Record<string, unknown> | null): string => {
  if (!obj) return ''
  return JSON.stringify(obj, null, 2)
}

const timeFields = new Set(['exp', 'iat', 'nbf', 'auth_time', 'updated_at'])
const clearInput = () => { input.value = '' }

// ===== 签名验证 =====
const verifyKey     = ref('')
const verifyResult  = ref<{ status: 'idle' | 'computing' | 'valid' | 'invalid' | 'error'; message: string }>({ status: 'idle', message: '' })

const enc = new TextEncoder()

async function verifySignature() {
  const token = input.value.trim()
  if (!token || !verifyKey.value) {
    verifyResult.value = { status: 'error', message: '请先粘贴 JWT Token 并输入密钥' }
    return
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    verifyResult.value = { status: 'error', message: 'JWT 格式错误：需要三段结构' }
    return
  }

  const [headerRaw, payloadRaw, signatureRaw] = parts
  verifyResult.value = { status: 'computing', message: '验证中...' }

  try {
    const headerStr = decodeBase64Url(headerRaw)
    const header = JSON.parse(headerStr)
    const alg = header.alg as string

    const signingInput = `${headerRaw}.${payloadRaw}`
    const keyBytes = enc.encode(verifyKey.value)
    const dataBytes = enc.encode(signingInput)

    if (alg === 'HS256' || alg === 'HS384' || alg === 'HS512') {
      const hashAlgo = alg === 'HS256' ? 'SHA-256' : alg === 'HS384' ? 'SHA-384' : 'SHA-512'
      const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: hashAlgo }, false, ['sign'])
      const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, dataBytes)
      const computedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      const match = computedSig === signatureRaw
      verifyResult.value = match
        ? { status: 'valid', message: '签名验证通过！密钥正确，Token 未被篡改。' }
        : { status: 'invalid', message: '签名验证失败：密钥不正确或 Token 已被篡改。' }
    } else {
      verifyResult.value = { status: 'error', message: `算法 ${alg} 不支持前端验证。仅支持 HS256 / HS384 / HS512（HMAC 对称密钥）。RS256 等非对称算法需要公钥，暂不支持。` }
    }
  } catch (e) {
    verifyResult.value = { status: 'error', message: `验证失败：${e instanceof Error ? e.message : String(e)}` }
  }
}

// 示例 Token（HS256，密钥为 "my-secret-key"）
const demoToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsIm5hbWUiOiLlvKDkuK3nlKgiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MjIzMjgwMDAsImV4cCI6OTk5OTk5OTk5OX0.tGNxVRJ1Q0wKbzqzjZ3K3iHf3Vq3h3j3h3j3h3j3h3j'
const loadDemo = () => {
  input.value = demoToken
  verifyKey.value = 'my-secret-key'
}
</script>

<template>
  <div class="space-y-5">
    <!-- Tab 切换 -->
    <div class="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-slate-800/60 w-fit">
      <button v-for="tab in [{ key: 'decode', label: '🔓 解码' }, { key: 'verify', label: '✅ 签名验证' }]" :key="tab.key"
        @click="activeTab = tab.key as Tab"
        :class="['px-4 py-2 text-sm font-medium rounded-lg transition-all', activeTab === tab.key ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200']"
      >{{ tab.label }}</button>
    </div>

    <!-- 输入区 -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <label class="text-sm font-semibold text-gray-700 dark:text-slate-200">粘贴 JWT Token</label>
        <div class="flex gap-2">
          <button @click="loadDemo" class="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">载入示例</button>
          <button @click="clearInput" class="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-red-300 hover:text-red-500 transition-all">清空</button>
        </div>
      </div>
      <textarea v-model="input" rows="4" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"
        class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none transition-all leading-relaxed"
        spellcheck="false"></textarea>
      <!-- Token 三段颜色高亮预览 -->
      <div v-if="input.trim() && result.headerRaw" class="mt-2 px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-slate-800/60 text-xs font-mono break-all leading-relaxed">
        <span class="text-red-500 dark:text-red-400">{{ result.headerRaw }}</span>
        <span class="text-gray-400 dark:text-slate-600">.</span>
        <span class="text-purple-500 dark:text-purple-400">{{ result.payloadRaw }}</span>
        <span class="text-gray-400 dark:text-slate-600">.</span>
        <span class="text-cyan-500 dark:text-cyan-400">{{ result.signatureRaw }}</span>
      </div>
    </div>

    <!-- ====== 解码 Tab ====== -->
    <div v-if="activeTab === 'decode'" class="space-y-5">
      <!-- 错误提示 -->
      <div v-if="input.trim() && !result.valid && result.error" class="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
        <svg class="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        {{ result.error }}
      </div>

      <!-- 解码结果 -->
      <div v-if="result.valid && result.header && result.payload" class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div class="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/40">
            <div class="w-2.5 h-2.5 rounded-full bg-red-400"></div>
            <span class="text-sm font-semibold text-red-700 dark:text-red-300">Header</span>
            <span class="text-xs text-red-500/70 dark:text-red-500/60 ml-auto">算法 &amp; 类型</span>
          </div>
          <div class="p-4 space-y-2">
            <div v-for="(val, key) in result.header" :key="String(key)" class="flex items-start justify-between gap-4 text-sm">
              <span class="text-gray-500 dark:text-slate-500 font-mono flex-shrink-0">{{ key }}</span>
              <span class="text-gray-900 dark:text-white font-mono text-right">{{ String(val) }}</span>
            </div>
          </div>
          <pre class="px-4 pb-4 text-xs font-mono text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-900/40 overflow-auto">{{ prettyJson(result.header) }}</pre>
        </div>

        <div class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div class="flex items-center gap-2 px-4 py-2.5 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-900/40">
            <div class="w-2.5 h-2.5 rounded-full bg-purple-400"></div>
            <span class="text-sm font-semibold text-purple-700 dark:text-purple-300">Payload</span>
            <span v-if="expireStatus" :class="['text-xs font-medium ml-auto', expireStatus.color]">{{ expireStatus.label }}</span>
          </div>
          <div class="p-4 space-y-2">
            <div v-for="(val, key) in result.payload" :key="String(key)" class="flex items-start justify-between gap-4 text-sm">
              <span class="text-gray-500 dark:text-slate-500 font-mono flex-shrink-0">{{ key }}</span>
              <div class="text-right">
                <span class="text-gray-900 dark:text-white font-mono">{{ String(val) }}</span>
                <div v-if="timeFields.has(String(key)) && typeof val === 'number'" class="text-xs text-gray-400 dark:text-slate-600 mt-0.5">{{ formatTime(val) }}</div>
              </div>
            </div>
          </div>
          <pre class="px-4 pb-4 text-xs font-mono text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-900/40 overflow-auto">{{ prettyJson(result.payload) }}</pre>
        </div>

        <div class="lg:col-span-2 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div class="flex items-center gap-2 px-4 py-2.5 bg-cyan-50 dark:bg-cyan-900/20 border-b border-cyan-100 dark:border-cyan-900/40">
            <div class="w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
            <span class="text-sm font-semibold text-cyan-700 dark:text-cyan-300">Signature</span>
            <span class="text-xs text-cyan-500/70 dark:text-cyan-500/60 ml-auto">切换到「签名验证」Tab 可验证 HS256/384/512 签名</span>
          </div>
          <div class="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-500 break-all">{{ result.signatureRaw }}</div>
        </div>
      </div>

      <div v-if="!input.trim()" class="py-12 text-center text-gray-400 dark:text-slate-600">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
        <p class="text-sm">粘贴 JWT Token 开始解码</p>
      </div>
    </div>

    <!-- ====== 签名验证 Tab ====== -->
    <div v-else class="space-y-5">
      <!-- 密钥输入 -->
      <div>
        <label class="block text-sm font-semibold text-gray-700 dark:text-slate-200 mb-2">HMAC 密钥（Secret Key）</label>
        <input v-model="verifyKey" type="text" spellcheck="false" placeholder="输入签发 JWT 时使用的密钥..."
          class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
        />
      </div>

      <!-- 验证按钮 -->
      <button @click="verifySignature" :disabled="!input.trim() || !verifyKey || verifyResult.status === 'computing'"
        :class="['w-full py-3 rounded-xl text-sm font-semibold transition-all', (!input.trim() || !verifyKey || verifyResult.status === 'computing') ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed' : 'bg-accent hover:bg-accent-dark text-white shadow-lg shadow-accent/20']"
      >
        <span v-if="verifyResult.status === 'computing'" class="flex items-center justify-center gap-2">
          <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          验证中...
        </span>
        <span v-else>✅ 验证签名</span>
      </button>

      <!-- 验证结果 -->
      <div v-if="verifyResult.status !== 'idle' && verifyResult.status !== 'computing'"
        :class="['flex items-start gap-3 px-4 py-3 rounded-xl border text-sm transition-all', {
          'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400': verifyResult.status === 'valid',
          'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400': verifyResult.status === 'invalid',
          'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400': verifyResult.status === 'error',
        }]"
      >
        <span v-if="verifyResult.status === 'valid'" class="text-lg flex-shrink-0">✅</span>
        <span v-else-if="verifyResult.status === 'invalid'" class="text-lg flex-shrink-0">❌</span>
        <span v-else class="text-lg flex-shrink-0">⚠️</span>
        <span>{{ verifyResult.message }}</span>
      </div>

      <!-- 算法说明 -->
      <div class="px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-xs text-blue-600 dark:text-blue-400 leading-relaxed space-y-2">
        <div><strong>支持的算法：</strong>HS256 / HS384 / HS512（HMAC-SHA，对称密钥）</div>
        <div><strong>不支持：</strong>RS256 / RS384 / RS512 等非对称算法（需要公钥验证，暂不支持）</div>
        <div><strong>原理：</strong>用密钥对 header.payload 做 HMAC-SHA 运算，将结果与 Token 中的签名段比对，一致则验证通过。</div>
        <div class="pt-1 border-t border-blue-100 dark:border-blue-800/50">所有运算通过 Web Crypto API 在浏览器本地完成，<strong>密钥不会上传到服务器</strong>。</div>
      </div>
    </div>
  </div>
</template>
