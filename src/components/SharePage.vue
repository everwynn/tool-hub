<script setup lang="ts">
// ============================================================
// SharePage — 加密分享页面（AES-256-GCM + PBKDF2）
// 从 URL hash 中读取加密数据，用户输入密码后通过 iframe 加载目标页
// URL 始终保持在 /share#v=1&d=密文，不暴露真实目标地址
// ============================================================

import { ref, computed, onMounted } from 'vue'

// GitHub Pages 子路径部署：拼接 base 前缀（本地 dev 为 '/'）
const BASE = import.meta.env.BASE_URL

const hashData = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const mounted = ref(false)
const iframeUrl = ref('')  // 验证成功后设置，用 iframe 加载目标页

onMounted(() => {
  mounted.value = true
  const hash = window.location.hash.slice(1)
  if (hash) {
    const params = new URLSearchParams(hash)
    hashData.value = params.get('d') || ''
  }
})

const hasHashData = computed(() => !!hashData.value)

// ============ Web Crypto API 加密/解密工具 ============

function base64UrlEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Uint8Array.from(atob(str), c => c.charCodeAt(0))
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** 加密：明文 + 密码 → Base64url 密文 */
async function encryptData(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(8))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)
    )
  )
  const combined = new Uint8Array(salt.length + iv.length + encrypted.length)
  combined.set(salt, 0)
  combined.set(iv, 8)
  combined.set(encrypted, 20)
  return base64UrlEncode(combined)
}

/** 解密：Base64url 密文 + 密码 → 明文 */
async function decryptData(ciphertext: string, password: string): Promise<string> {
  const data = base64UrlDecode(ciphertext)
  const salt = data.slice(0, 8)
  const iv = data.slice(8, 20)
  const encrypted = data.slice(20)
  const key = await deriveKey(password, salt)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, encrypted
  )
  return new TextDecoder().decode(decrypted)
}

// ============ 密码强度 ============

const passwordStrength = computed(() => {
  const p = password.value
  if (!p) return { score: 0, label: '', color: '' }
  let score = 0
  if (p.length >= 6) score++
  if (p.length >= 10) score++
  if (/[A-Z]/.test(p)) score++
  if (/[0-9]/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++
  if (score <= 1) return { score: 1, label: '弱', color: 'bg-red-500' }
  if (score <= 2) return { score: 2, label: '较弱', color: 'bg-orange-500' }
  if (score <= 3) return { score: 3, label: '中等', color: 'bg-yellow-500' }
  if (score <= 4) return { score: 4, label: '较强', color: 'bg-blue-500' }
  return { score: 5, label: '强', color: 'bg-green-500' }
})

// ============ 提交验证 ============

async function handleSubmit() {
  if (!password.value || !hashData.value) return
  loading.value = true
  error.value = ''
  try {
    const plaintext = await decryptData(hashData.value, password.value)
    const colonIdx = plaintext.indexOf(':')
    if (colonIdx === -1) throw new Error('invalid')
    const type = plaintext.substring(0, colonIdx)
    const slug = plaintext.substring(colonIdx + 1)
    // 尾斜杠与 trailingSlash: 'always' 一致，避免 404/301
    const targetPath = type === 't' ? `${BASE}tools/${slug}/` : `${BASE}demos/${slug}/`
    // 不跳转！用 iframe 加载，URL 保持在 /share#v=1&d=密文
    iframeUrl.value = targetPath + '?mode=share'
  } catch {
    error.value = '密码错误，请重试'
    loading.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') handleSubmit()
}
</script>

<template>
  <!-- iframe 模式：验证成功后全屏展示目标页，URL 不变 -->
  <iframe
    v-if="iframeUrl"
    :src="iframeUrl"
    class="fixed inset-0 w-screen h-screen border-0"
    allow="fullscreen; clipboard-read; clipboard-write"
  />

  <div v-else class="min-h-screen flex items-center justify-center px-4">
    <!-- 无加密数据 -->
    <div v-if="mounted && !hasHashData" class="text-center">
      <div class="text-5xl mb-4">🔗</div>
      <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-2">无效的分享链接</h1>
      <p class="text-gray-500 dark:text-slate-400 mb-6">此分享链接已失效或格式不正确</p>
      <a href="/" class="text-accent-dark dark:text-accent hover:underline text-sm">返回 ToolHub 首页</a>
    </div>

    <!-- 密码验证表单 -->
    <div v-else-if="hasHashData" class="w-full max-w-sm">
      <div class="text-center mb-8">
        <div class="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-1">此分享已加密</h1>
        <p class="text-sm text-gray-500 dark:text-slate-400">请输入分享者提供的密码查看内容</p>
      </div>

      <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-6">
        <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">访问密码</label>
        <input
          v-model="password"
          type="password"
          placeholder="请输入密码"
          :disabled="loading"
          @keydown="handleKeydown"
          autofocus
          class="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all mb-2"
        />

        <!-- 密码强度指示器 -->
        <div v-if="password" class="flex items-center gap-2 mb-4">
          <div class="flex gap-1 flex-1">
            <div
              v-for="i in 5" :key="i"
              :class="['h-1 flex-1 rounded-full transition-colors', i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200 dark:bg-slate-700']"
            />
          </div>
          <span class="text-xs text-gray-500 dark:text-slate-400 w-8">{{ passwordStrength.label }}</span>
        </div>

        <!-- 错误提示 -->
        <p v-if="error" class="text-sm text-red-600 dark:text-red-400 mb-3 flex items-center gap-1.5">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {{ error }}
        </p>

        <button
          @click="handleSubmit"
          :disabled="!password || loading"
          :class="[
            'w-full py-2.5 rounded-lg font-medium text-sm transition-all',
            password && !loading
              ? 'bg-accent hover:bg-accent-dark text-white'
              : 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
          ]"
        >
          {{ loading ? '验证中...' : '验证并查看' }}
        </button>
      </div>

      <p class="text-center text-xs text-gray-400 dark:text-slate-600 mt-4">
        使用 AES-256-GCM 加密保护
      </p>

      <div class="text-center mt-6">
        <a href="/" class="text-sm text-gray-400 dark:text-slate-500 hover:text-accent dark:hover:text-accent transition-colors">
          ← 返回 ToolHub
        </a>
      </div>
    </div>
  </div>
</template>
