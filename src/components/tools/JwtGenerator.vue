<script setup lang="ts">
// ============================================================
// JwtGenerator — JWT 生成器
// 浏览器本地用 Web Crypto HMAC 签发 HS256/384/512 Token
// ============================================================

import { ref, computed, watch } from 'vue'

type Alg = 'HS256' | 'HS384' | 'HS512'

const ALGS: Alg[] = ['HS256', 'HS384', 'HS512']
const HASH: Record<Alg, string> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }

const alg = ref<Alg>('HS256')
const secret = ref('')
const showSecret = ref(false)
const payloadText = ref('')
const token = ref('')
const error = ref('')
const payloadObj = ref<Record<string, unknown> | null>(null)
const copied = ref(false)

function makeSample(): string {
  const now = Math.floor(Date.now() / 1000)
  return JSON.stringify(
    {
      sub: '1234567890',
      name: 'Alice',
      role: 'admin',
      iat: now,
      exp: now + 3600,
    },
    null,
    2
  )
}

payloadText.value = makeSample()

const headerJson = computed(() => JSON.stringify({ alg: alg.value, typ: 'JWT' }))

// ======================== 编码 / 签名 ========================

function b64urlBytes(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlStr(s: string): string {
  return b64urlBytes(new TextEncoder().encode(s))
}

async function signHmac(message: string, keyStr: string, a: Alg): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyStr),
    { name: 'HMAC', hash: HASH[a] },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return b64urlBytes(new Uint8Array(sig))
}

// ======================== 生成（防抖 + 竞态保护） ========================

let seq = 0
let timer: ReturnType<typeof setTimeout> | null = null

async function generate() {
  const mySeq = ++seq
  error.value = ''
  payloadObj.value = null

  if (!secret.value) {
    token.value = ''
    return
  }

  let payload: unknown
  try {
    payload = JSON.parse(payloadText.value)
  } catch {
    token.value = ''
    error.value = 'Payload 不是合法的 JSON'
    return
  }

  try {
    const h = b64urlStr(headerJson.value)
    const p = b64urlStr(JSON.stringify(payload))
    const sig = await signHmac(`${h}.${p}`, secret.value, alg.value)
    if (mySeq !== seq) return
    token.value = `${h}.${p}.${sig}`
    payloadObj.value = payload as Record<string, unknown>
  } catch (e) {
    if (mySeq !== seq) return
    token.value = ''
    error.value = e instanceof Error ? `签名失败：${e.message}` : '签名失败'
  }
}

watch(
  [alg, payloadText, secret],
  () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(generate, 250)
  },
  { immediate: true }
)

// ======================== 时间字段可读化 ========================

const timeFields = computed(() => {
  const out: { key: string; text: string }[] = []
  const obj = payloadObj.value
  if (!obj) return out
  for (const key of ['iat', 'nbf', 'exp']) {
    const v = obj[key]
    if (typeof v === 'number') {
      out.push({ key, text: new Date(v * 1000).toLocaleString('zh-CN', { hour12: false }) })
    }
  }
  return out
})

// ======================== 操作 ========================

const copyToken = async () => {
  if (!token.value) return
  await navigator.clipboard.writeText(token.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <div class="space-y-5">
    <!-- 选项栏 -->
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1">
        <span class="text-xs text-gray-500 dark:text-slate-500">签名算法</span>
        <div class="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <button
            v-for="a in ALGS"
            :key="a"
            @click="alg = a"
            :class="['px-3 py-1.5 text-sm font-mono transition-colors', alg === a
              ? 'bg-accent text-white'
              : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:text-accent']"
          >{{ a }}</button>
        </div>
      </div>

      <label class="flex flex-col gap-1 flex-1 min-w-48">
        <span class="text-xs text-gray-500 dark:text-slate-500">密钥（Secret）</span>
        <div class="relative">
          <input
            v-model="secret"
            :type="showSecret ? 'text' : 'password'"
            spellcheck="false"
            placeholder="输入 HMAC 密钥，至少 32 字符更安全"
            class="w-full px-3 py-1.5 pr-16 text-sm font-mono rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
          />
          <button
            @click="showSecret = !showSecret"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-slate-500 hover:text-accent"
          >{{ showSecret ? '隐藏' : '显示' }}</button>
        </div>
      </label>
    </div>

    <!-- Payload / 输出 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">Payload（JSON）</span>
          <div class="flex gap-2">
            <button @click="payloadText = makeSample()" class="text-xs px-2.5 py-0.5 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">重置示例</button>
            <button @click="payloadText = '{}'" class="text-xs px-2.5 py-0.5 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">清空</button>
          </div>
        </div>
        <textarea
          v-model="payloadText"
          spellcheck="false"
          class="w-full h-72 px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none leading-relaxed"
        ></textarea>
        <div v-if="error" class="mt-1.5 text-xs text-red-500 dark:text-red-400">{{ error }}</div>
        <div class="mt-1.5 text-xs text-gray-400 dark:text-slate-600">
          Header 自动生成：<span class="font-mono">{{ headerJson }}</span>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">生成的 JWT</span>
          <button
            @click="copyToken"
            :disabled="!token"
            :class="['text-xs px-2.5 py-0.5 rounded border transition-all', token
              ? (copied ? 'border-green-400 text-green-600 dark:text-green-400' : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/40 hover:text-accent')
              : 'border-gray-100 dark:border-slate-800 text-gray-300 dark:text-slate-700 cursor-not-allowed']"
          >{{ copied ? '已复制' : '复制' }}</button>
        </div>
        <div class="w-full h-72 px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 overflow-auto leading-relaxed">
          <code v-if="token" class="break-all text-gray-800 dark:text-slate-200">{{ token }}</code>
          <span v-else class="text-gray-300 dark:text-slate-700">{{ secret ? '等待生成…' : '输入密钥（Secret）后自动生成 Token' }}</span>
        </div>
        <div v-if="timeFields.length" class="mt-2 flex flex-wrap gap-2">
          <span v-for="t in timeFields" :key="t.key" class="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700">
            {{ t.key }} → {{ t.text }}
          </span>
        </div>
        <div v-else-if="token" class="mt-2 text-xs text-gray-400 dark:text-slate-600">Payload 未包含 iat / nbf / exp 时间字段</div>
      </div>
    </div>

    <!-- 说明 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
      <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-2">使用说明</h3>
      <ul class="text-xs text-gray-500 dark:text-slate-500 space-y-1 list-disc list-inside">
        <li>支持 HS256 / HS384 / HS512（HMAC 对称签名），签名在浏览器本地通过 Web Crypto 完成，密钥不上传</li>
        <li>Payload 常用声明：sub（主体）、iat（签发时间，秒）、exp（过期时间，秒）、nbf（生效时间）</li>
        <li>生成的 Token 可粘贴到本工具「JWT 解码器」或 jwt.io 验证；RS256 等非对称签名需在服务端用私钥签发</li>
      </ul>
    </div>
  </div>
</template>
