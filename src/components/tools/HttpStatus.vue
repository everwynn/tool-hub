<script setup lang="ts">
// ============================================================
// HttpStatus — HTTP 状态码速查工具
// ============================================================

import { ref, computed } from 'vue'

interface StatusCode {
  code: number
  name: string
  desc: string
  detail: string
  category: '1xx' | '2xx' | '3xx' | '4xx' | '5xx'
}

const allCodes: StatusCode[] = [
  // 1xx
  { code: 100, name: 'Continue',             category: '1xx', desc: '继续', detail: '服务器已收到请求头，客户端应继续发送请求体。' },
  { code: 101, name: 'Switching Protocols',  category: '1xx', desc: '切换协议', detail: '服务器同意客户端升级协议（如 HTTP→WebSocket）。' },
  // 2xx
  { code: 200, name: 'OK',                   category: '2xx', desc: '请求成功', detail: '最常见的成功状态码，GET/POST 请求成功返回。' },
  { code: 201, name: 'Created',              category: '2xx', desc: '已创建', detail: 'POST 创建资源成功，通常返回新资源的 Location 头。' },
  { code: 202, name: 'Accepted',             category: '2xx', desc: '已接受', detail: '请求已接受但尚未处理完成，常用于异步任务。' },
  { code: 204, name: 'No Content',           category: '2xx', desc: '无内容', detail: '请求成功但无响应体，常用于 DELETE / PUT 操作。' },
  { code: 206, name: 'Partial Content',      category: '2xx', desc: '部分内容', detail: '断点续传，客户端发送 Range 请求头时返回。' },
  // 3xx
  { code: 301, name: 'Moved Permanently',    category: '3xx', desc: '永久重定向', detail: '资源永久移到新 URL，浏览器会缓存该重定向。SEO 友好。' },
  { code: 302, name: 'Found',                category: '3xx', desc: '临时重定向', detail: '资源临时移到新 URL，不会被缓存。POST 重定向时方法可能变为 GET。' },
  { code: 304, name: 'Not Modified',         category: '3xx', desc: '未修改', detail: '协商缓存命中，客户端使用本地缓存，服务端无需返回响应体。' },
  { code: 307, name: 'Temporary Redirect',   category: '3xx', desc: '临时重定向（保持方法）', detail: '类似 302，但要求客户端保持原 HTTP 方法（POST 不会变成 GET）。' },
  { code: 308, name: 'Permanent Redirect',   category: '3xx', desc: '永久重定向（保持方法）', detail: '类似 301，但保持原 HTTP 方法。' },
  // 4xx
  { code: 400, name: 'Bad Request',          category: '4xx', desc: '请求错误', detail: '请求语法错误或参数不合法，服务器无法处理。检查请求体格式。' },
  { code: 401, name: 'Unauthorized',         category: '4xx', desc: '未认证', detail: '需要身份验证（通常是 JWT/Session 缺失或过期）。注意：名字叫 Unauthorized 但实际是 Unauthenticated。' },
  { code: 403, name: 'Forbidden',            category: '4xx', desc: '无权限', detail: '已认证但无操作权限。与 401 的区别：401 是未登录，403 是登录了但没权限。' },
  { code: 404, name: 'Not Found',            category: '4xx', desc: '资源不存在', detail: '请求的资源在服务器上不存在。也可故意用于隐藏 403（安全考虑）。' },
  { code: 405, name: 'Method Not Allowed',   category: '4xx', desc: '方法不允许', detail: '该资源不支持当前 HTTP 方法（如对 GET 接口发送 POST）。' },
  { code: 408, name: 'Request Timeout',      category: '4xx', desc: '请求超时', detail: '客户端发送请求太慢，服务器等待超时。' },
  { code: 409, name: 'Conflict',             category: '4xx', desc: '冲突', detail: '请求与当前资源状态冲突，如重复创建唯一字段。' },
  { code: 410, name: 'Gone',                 category: '4xx', desc: '已删除', detail: '资源已被永久删除，与 404 的区别是明确表示曾经存在过。' },
  { code: 413, name: 'Payload Too Large',    category: '4xx', desc: '请求体过大', detail: '上传文件或请求体超过服务器限制（Nginx client_max_body_size）。' },
  { code: 422, name: 'Unprocessable Entity', category: '4xx', desc: '无法处理', detail: '语法正确但语义错误，常用于参数校验失败（REST API 推荐）。' },
  { code: 429, name: 'Too Many Requests',    category: '4xx', desc: '请求过多', detail: '触发限流（Rate Limit），通常包含 Retry-After 响应头。' },
  // 5xx
  { code: 500, name: 'Internal Server Error',category: '5xx', desc: '服务器内部错误', detail: '服务端程序抛出未捕获异常，需查看服务器日志排查。' },
  { code: 501, name: 'Not Implemented',      category: '5xx', desc: '未实现', detail: '服务器不支持该请求功能，如不支持某 HTTP 方法。' },
  { code: 502, name: 'Bad Gateway',          category: '5xx', desc: '网关错误', detail: '反向代理（Nginx）无法从后端服务获得有效响应。后端服务未启动或端口错误。' },
  { code: 503, name: 'Service Unavailable',  category: '5xx', desc: '服务不可用', detail: '服务器暂时不可用，通常是过载或维护中。建议返回 Retry-After 头。' },
  { code: 504, name: 'Gateway Timeout',      category: '5xx', desc: '网关超时', detail: '反向代理等待后端响应超时（Nginx proxy_read_timeout）。' },
  { code: 508, name: 'Loop Detected',        category: '5xx', desc: '检测到循环', detail: '服务器在处理请求时检测到无限循环。' },
]

const categoryColors: Record<string, string> = {
  '1xx': 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700',
  '2xx': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  '3xx': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  '4xx': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  '5xx': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
}

const categoryDesc: Record<string, string> = {
  '1xx': '信息性响应',
  '2xx': '成功',
  '3xx': '重定向',
  '4xx': '客户端错误',
  '5xx': '服务器错误',
}

const searchQuery = ref('')
const activeCategory = ref('all')
const expanded = ref<number | null>(null)

const categories = ['all', '1xx', '2xx', '3xx', '4xx', '5xx']

const filtered = computed(() => {
  let list = allCodes
  if (activeCategory.value !== 'all') {
    list = list.filter(c => c.category === activeCategory.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(c =>
      String(c.code).includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.desc.includes(q) ||
      c.detail.toLowerCase().includes(q)
    )
  }
  return list
})

const toggle = (code: number) => {
  expanded.value = expanded.value === code ? null : code
}
</script>

<template>
  <div class="space-y-5">
    <!-- 搜索 + 分类 -->
    <div class="flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1 max-w-xs">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input v-model="searchQuery" type="text" placeholder="输入状态码或关键词..." class="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"/>
      </div>
      <div class="flex flex-wrap gap-2">
        <button v-for="cat in categories" :key="cat"
          @click="activeCategory = cat"
          :class="[
            'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
            activeCategory === cat
              ? 'bg-accent text-white border-accent'
              : cat === 'all'
                ? 'bg-white dark:bg-slate-900/50 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40'
                : categoryColors[cat] + ' hover:opacity-80'
          ]"
        >
          {{ cat === 'all' ? '全部' : cat }} {{ cat !== 'all' ? `· ${categoryDesc[cat]}` : '' }}
        </button>
      </div>
    </div>

    <!-- 统计 -->
    <div class="text-xs text-gray-400 dark:text-slate-600">
      共 {{ filtered.length }} 个状态码
    </div>

    <!-- 状态码列表 -->
    <div class="space-y-2">
      <div v-for="item in filtered" :key="item.code"
        class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 overflow-hidden transition-all"
      >
        <button
          @click="toggle(item.code)"
          class="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
        >
          <!-- 状态码 -->
          <span :class="['text-lg font-bold font-mono w-12 flex-shrink-0 px-2 py-0.5 rounded text-center text-sm border', categoryColors[item.category]]">
            {{ item.code }}
          </span>
          <!-- 名称 + 描述 -->
          <div class="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
            <span class="font-mono text-sm text-gray-700 dark:text-slate-300 font-medium">{{ item.name }}</span>
            <span class="text-sm text-gray-500 dark:text-slate-500">{{ item.desc }}</span>
          </div>
          <!-- 展开箭头 -->
          <svg :class="['w-4 h-4 text-gray-400 flex-shrink-0 transition-transform', expanded === item.code ? 'rotate-180' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        <!-- 展开详情 -->
        <div v-if="expanded === item.code" class="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-slate-800">
          <p class="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">{{ item.detail }}</p>
        </div>
      </div>
      <div v-if="filtered.length === 0" class="py-12 text-center text-gray-400 dark:text-slate-600 text-sm">
        未找到匹配的状态码
      </div>
    </div>
  </div>
</template>
