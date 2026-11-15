<script setup lang="ts">
// ============================================================
// SharePanel — 分享面板弹窗
// 支持公开分享（token 短链）和加密分享（AES-256-GCM）两种模式
// ============================================================

import { ref, computed, watch, nextTick } from 'vue'

// GitHub Pages 子路径部署：拼接 base 前缀（本地 dev 为 '/'）
const BASE = import.meta.env.BASE_URL

interface Props {
  publicShareUrl: string
  target: string  // 如 't:json-formatter' 或 'd:mysql-optimization'
}

const props = defineProps<Props>()

const showPanel = ref(false)
const activeTab = ref<'public' | 'encrypted'>('public')
const copied = ref(false)

// 加密分享状态
const encPassword = ref('')
const encConfirmPassword = ref('')
const encLink = ref('')
const encGenerating = ref(false)
const encError = ref('')

// ============ AES-256-GCM 加密 ============

function base64UrlEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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
    ['encrypt']
  )
}

async function encryptData(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(8))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  )
  const combined = new Uint8Array(salt.length + iv.length + encrypted.length)
  combined.set(salt, 0)
  combined.set(iv, 8)
  combined.set(encrypted, 20)
  return base64UrlEncode(combined)
}

// ============ 密码强度 ============

const passwordStrength = computed(() => {
  const p = encPassword.value
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

const passwordsMatch = computed(() => encPassword.value === encConfirmPassword.value)

// ============ 生成加密链接 ============

async function generateEncryptedLink() {
  if (!encPassword.value || !passwordsMatch.value) return
  encGenerating.value = true
  encError.value = ''
  try {
    const ciphertext = await encryptData(props.target, encPassword.value)
    const origin = window.location.origin
    // 尾斜杠与 trailingSlash: 'always' 一致，避免 GitHub Pages 301 跳转（hash 不受影响）
    encLink.value = `${origin}${BASE}share/#v=1&d=${ciphertext}`
  } catch {
    encError.value = '加密失败，请重试'
  }
  encGenerating.value = false
}

// 密码变化时重新生成链接
watch([encPassword, encConfirmPassword], () => {
  if (encPassword.value && passwordsMatch.value && encPassword.value.length >= 4) {
    generateEncryptedLink()
  } else {
    encLink.value = ''
  }
})

// ============ 复制链接 ============

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // fallback
    const textarea = document.createElement('textarea')
    textarea.value = url
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

// ============ 切换 Tab 时重置 ============

watch(activeTab, () => {
  encPassword.value = ''
  encConfirmPassword.value = ''
  encLink.value = ''
  encError.value = ''
})

// ESC 关闭
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') showPanel.value = false
}

watch(showPanel, (val) => {
  if (val) {
    document.addEventListener('keydown', handleKeydown)
  } else {
    document.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<template>
  <!-- 分享按钮 -->
  <button
    @click="showPanel = true"
    class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:text-accent-dark dark:hover:text-accent hover:border-accent/40 transition-all"
    title="分享"
  >
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
    分享
  </button>

  <!-- 遮罩 + 弹窗 -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="showPanel" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- 背景遮罩 -->
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="showPanel = false" />

        <!-- 弹窗内容 -->
        <div class="relative w-full max-w-md rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
          <!-- 头部 -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <svg class="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              分享此页面
            </h3>
            <button @click="showPanel = false" class="text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Tab 切换 -->
          <div class="flex px-6 pt-4 gap-1">
            <button
              @click="activeTab = 'public'"
              :class="[
                'flex-1 py-2 text-sm font-medium rounded-lg transition-all',
                activeTab === 'public'
                  ? 'bg-accent/10 text-accent-dark dark:text-accent border border-accent/20'
                  : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
              ]"
            >
              🔗 公开分享
            </button>
            <button
              @click="activeTab = 'encrypted'"
              :class="[
                'flex-1 py-2 text-sm font-medium rounded-lg transition-all',
                activeTab === 'encrypted'
                  ? 'bg-accent/10 text-accent-dark dark:text-accent border border-accent/20'
                  : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
              ]"
            >
              🔒 加密分享
            </button>
          </div>

          <!-- 内容区 -->
          <div class="px-6 py-4">
            <!-- 公开分享 -->
            <div v-if="activeTab === 'public'" class="space-y-3">
              <p class="text-sm text-gray-500 dark:text-slate-400">
                任何拥有链接的人都可以直接访问
              </p>
              <div class="flex items-center gap-2">
                <input
                  :value="publicShareUrl"
                  readonly
                  class="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300"
                />
                <button
                  @click="copyLink(publicShareUrl)"
                  :class="[
                    'px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
                    copied
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-accent hover:bg-accent-dark text-white'
                  ]"
                >
                  <svg v-if="!copied" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  {{ copied ? '已复制' : '复制' }}
                </button>
              </div>
            </div>

            <!-- 加密分享 -->
            <div v-if="activeTab === 'encrypted'" class="space-y-3">
              <p class="text-sm text-gray-500 dark:text-slate-400">
                设置密码后，接收者需要输入密码才能查看
              </p>

              <!-- 密码输入 -->
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">设置密码</label>
                <input
                  v-model="encPassword"
                  type="text"
                  placeholder="至少 4 位字符"
                  class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
                />
                <!-- 密码强度 -->
                <div v-if="encPassword" class="flex items-center gap-2 mt-1.5">
                  <div class="flex gap-1 flex-1">
                    <div
                      v-for="i in 5" :key="i"
                      :class="['h-1 flex-1 rounded-full transition-colors', i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200 dark:bg-slate-700']"
                    />
                  </div>
                  <span class="text-xs text-gray-500 dark:text-slate-400">{{ passwordStrength.label }}</span>
                </div>
              </div>

              <!-- 确认密码 -->
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">确认密码</label>
                <input
                  v-model="encConfirmPassword"
                  type="text"
                  placeholder="再次输入密码"
                  class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
                />
                <p v-if="encConfirmPassword && !passwordsMatch" class="text-xs text-red-500 mt-1">两次密码不一致</p>
              </div>

              <!-- 加密链接 -->
              <div v-if="encLink" class="pt-1">
                <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">加密链接（AES-256-GCM）</label>
                <div class="flex items-center gap-2">
                  <input
                    :value="encLink"
                    readonly
                    class="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-400 font-mono truncate"
                  />
                  <button
                    @click="copyLink(encLink)"
                    :class="[
                      'px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 flex-shrink-0',
                      copied
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-accent hover:bg-accent-dark text-white'
                    ]"
                  >
                    <svg v-if="!copied" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    {{ copied ? '已复制' : '复制' }}
                  </button>
                </div>
              </div>

              <!-- 提示 -->
              <div v-if="encPassword && encPassword.length < 4" class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                密码至少 4 位字符
              </div>
            </div>
          </div>

          <!-- 底部提示 -->
          <div class="px-6 pb-4">
            <p class="text-xs text-gray-400 dark:text-slate-600 flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              记得将密码通过其他方式告知接收者
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
