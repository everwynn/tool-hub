<script setup lang="ts">
// ============================================================
// NginxConfigGenerator — Nginx 配置文件生成器
// ============================================================
// 功能：
// 1. 支持 5 种场景：反向代理 / 静态站点 / HTTPS / 负载均衡 / WebSocket
// 2. 可选增强：Gzip 压缩 / 静态缓存 / CORS / 访问日志
// 3. 实时生成带注释的 nginx.conf
// 4. 一键复制 / 下载 .conf 文件
// ============================================================

import { ref, computed, watch } from 'vue'

// --- 场景定义 ---
const scenarios = [
  { key: 'proxy',    label: '反向代理',  icon: '🔀', desc: '将请求转发到后端服务（Node.js/Python/Java 等）' },
  { key: 'static',   label: '静态站点',  icon: '📁', desc: '直接提供静态文件服务（HTML/CSS/JS）' },
  { key: 'https',    label: 'HTTPS',     icon: '🔒', desc: 'SSL 证书配置 + HTTP 自动跳转 HTTPS' },
  { key: 'upstream', label: '负载均衡',  icon: '⚖️',  desc: 'upstream 多后端节点 + 负载均衡策略' },
  { key: 'websocket',label: 'WebSocket', icon: '🔌', desc: 'WebSocket 代理，自动升级协议头' },
]

// --- 表单数据 ---
const form = ref({
  // 基础
  scenario: 'proxy',
  domain: 'example.com',
  listenPort: '80',
  enableHttps: false,
  // 反向代理 / WebSocket
  backendHost: '127.0.0.1',
  backendPort: '3000',
  connectTimeout: '60',
  readTimeout: '60',
  // 静态站点
  rootPath: '/var/www/html',
  indexFile: 'index.html',
  // HTTPS
  sslCert: '/etc/letsencrypt/live/example.com/fullchain.pem',
  sslKey: '/etc/letsencrypt/live/example.com/privkey.pem',
  // 负载均衡
  upstreamName: 'backend_pool',
  upstreamNodes: '127.0.0.1:3001\n127.0.0.1:3002\n127.0.0.1:3003',
  lbMethod: 'round_robin',  // round_robin / ip_hash / least_conn
  // 可选增强
  enableGzip: true,
  enableCache: false,
  cacheExpire: '30d',
  enableCors: false,
  corsOrigin: '*',
  enableAccessLog: true,
})

// --- 复制状态 ---
const copied = ref(false)

// --- 实时生成配置 ---
const generatedConfig = computed(() => {
  const f = form.value
  const domain = f.domain || 'example.com'
  const lines: string[] = []

  // upstream 块（负载均衡场景）
  if (f.scenario === 'upstream') {
    const nodes = f.upstreamNodes
      .split('\n')
      .map(n => n.trim())
      .filter(Boolean)

    lines.push(`upstream ${f.upstreamName} {`)
    if (f.lbMethod === 'ip_hash') lines.push(`    ip_hash;`)
    if (f.lbMethod === 'least_conn') lines.push(`    least_conn;`)
    nodes.forEach(n => lines.push(`    server ${n};`))
    lines.push(`}`)
    lines.push(``)
  }

  // HTTP server 块（HTTPS 场景额外加 HTTP → HTTPS 跳转）
  if (f.scenario === 'https' || f.enableHttps) {
    lines.push(`# HTTP → HTTPS 跳转`)
    lines.push(`server {`)
    lines.push(`    listen 80;`)
    lines.push(`    server_name ${domain};`)
    lines.push(`    return 301 https://$host$request_uri;`)
    lines.push(`}`)
    lines.push(``)
  }

  // 主 server 块
  const isHttps = f.scenario === 'https' || f.enableHttps
  lines.push(`server {`)
  lines.push(`    listen ${isHttps ? '443 ssl http2' : f.listenPort};`)
  lines.push(`    server_name ${domain};`)
  lines.push(``)

  // SSL 配置
  if (isHttps) {
    lines.push(`    # SSL 证书配置`)
    lines.push(`    ssl_certificate     ${f.sslCert};`)
    lines.push(`    ssl_certificate_key ${f.sslKey};`)
    lines.push(`    ssl_protocols TLSv1.2 TLSv1.3;`)
    lines.push(`    ssl_ciphers HIGH:!aNULL:!MD5;`)
    lines.push(`    ssl_prefer_server_ciphers on;`)
    lines.push(`    ssl_session_cache shared:SSL:10m;`)
    lines.push(`    add_header Strict-Transport-Security "max-age=31536000" always;`)
    lines.push(``)
  }

  // Gzip 压缩
  if (f.enableGzip) {
    lines.push(`    # Gzip 压缩`)
    lines.push(`    gzip on;`)
    lines.push(`    gzip_vary on;`)
    lines.push(`    gzip_min_length 1024;`)
    lines.push(`    gzip_types text/plain text/css text/javascript application/json application/javascript application/xml;`)
    lines.push(``)
  }

  // 访问日志
  if (f.enableAccessLog) {
    lines.push(`    # 访问日志`)
    lines.push(`    access_log /var/log/nginx/${domain}.access.log;`)
    lines.push(`    error_log  /var/log/nginx/${domain}.error.log;`)
    lines.push(``)
  }

  // location 块
  lines.push(`    location / {`)

  // CORS
  if (f.enableCors) {
    lines.push(`        # CORS 跨域配置`)
    lines.push(`        add_header Access-Control-Allow-Origin "${f.corsOrigin}";`)
    lines.push(`        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";`)
    lines.push(`        add_header Access-Control-Allow-Headers "Authorization, Content-Type";`)
    lines.push(`        if ($request_method = OPTIONS) { return 204; }`)
    lines.push(``)
  }

  if (f.scenario === 'proxy') {
    lines.push(`        # 反向代理到后端服务`)
    lines.push(`        proxy_pass http://${f.backendHost}:${f.backendPort};`)
    lines.push(`        proxy_set_header Host $host;`)
    lines.push(`        proxy_set_header X-Real-IP $remote_addr;`)
    lines.push(`        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`)
    lines.push(`        proxy_set_header X-Forwarded-Proto $scheme;`)
    lines.push(`        proxy_connect_timeout ${f.connectTimeout}s;`)
    lines.push(`        proxy_read_timeout ${f.readTimeout}s;`)
  } else if (f.scenario === 'static') {
    lines.push(`        # 静态文件服务`)
    lines.push(`        root ${f.rootPath};`)
    lines.push(`        index ${f.indexFile};`)
    lines.push(`        try_files $uri $uri/ /${f.indexFile};`)
    if (f.enableCache) {
      lines.push(``)
      lines.push(`        # 静态资源缓存`)
      lines.push(`        location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {`)
      lines.push(`            expires ${f.cacheExpire};`)
      lines.push(`            add_header Cache-Control "public, immutable";`)
      lines.push(`        }`)
    }
  } else if (f.scenario === 'https') {
    lines.push(`        # 反向代理到后端服务`)
    lines.push(`        proxy_pass http://${f.backendHost}:${f.backendPort};`)
    lines.push(`        proxy_set_header Host $host;`)
    lines.push(`        proxy_set_header X-Real-IP $remote_addr;`)
    lines.push(`        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`)
    lines.push(`        proxy_set_header X-Forwarded-Proto $scheme;`)
  } else if (f.scenario === 'upstream') {
    lines.push(`        # 负载均衡转发`)
    lines.push(`        proxy_pass http://${f.upstreamName};`)
    lines.push(`        proxy_set_header Host $host;`)
    lines.push(`        proxy_set_header X-Real-IP $remote_addr;`)
    lines.push(`        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`)
  } else if (f.scenario === 'websocket') {
    lines.push(`        # WebSocket 代理`)
    lines.push(`        proxy_pass http://${f.backendHost}:${f.backendPort};`)
    lines.push(`        proxy_http_version 1.1;`)
    lines.push(`        proxy_set_header Upgrade $http_upgrade;`)
    lines.push(`        proxy_set_header Connection "upgrade";`)
    lines.push(`        proxy_set_header Host $host;`)
    lines.push(`        proxy_set_header X-Real-IP $remote_addr;`)
    lines.push(`        proxy_read_timeout 3600s;`)
  }

  lines.push(`    }`)
  lines.push(`}`)

  return lines.join('\n')
})

// --- 复制到剪贴板 ---
const copyConfig = async () => {
  await navigator.clipboard.writeText(generatedConfig.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

// --- 下载 .conf 文件 ---
const downloadConfig = () => {
  const blob = new Blob([generatedConfig.value], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${form.value.domain || 'nginx'}.conf`
  a.click()
  URL.revokeObjectURL(url)
}

// 切换场景时重置相关字段
watch(() => form.value.scenario, (s) => {
  form.value.enableHttps = (s === 'https')
  form.value.listenPort = (s === 'https') ? '443' : '80'
})
</script>

<template>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
    <!-- 左侧：配置表单 -->
    <div class="space-y-6">
      <!-- 场景选择 -->
      <div>
        <label class="block text-sm font-semibold text-gray-700 dark:text-slate-200 mb-3">选择场景</label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            v-for="s in scenarios"
            :key="s.key"
            @click="form.scenario = s.key"
            :class="[
              'text-left px-4 py-3 rounded-lg border transition-all duration-150',
              form.scenario === s.key
                ? 'bg-accent/10 border-accent/50 dark:border-accent/40 text-accent-dark dark:text-accent'
                : 'bg-white dark:bg-slate-900/50 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:border-accent/30'
            ]"
          >
            <span class="text-base mr-1.5">{{ s.icon }}</span>
            <span class="text-sm font-medium">{{ s.label }}</span>
            <p class="text-xs text-gray-500 dark:text-slate-500 mt-0.5">{{ s.desc }}</p>
          </button>
        </div>
      </div>

      <!-- 基础配置 -->
      <div class="bg-white dark:bg-slate-900/50 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-slate-200">基础配置</h3>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="field-label">域名</label>
            <input v-model="form.domain" type="text" placeholder="example.com" class="field-input" />
          </div>
          <div>
            <label class="field-label">监听端口</label>
            <input v-model="form.listenPort" type="text" placeholder="80" class="field-input" />
          </div>
        </div>

        <!-- 反向代理 / HTTPS / WebSocket 参数 -->
        <template v-if="['proxy', 'https', 'websocket'].includes(form.scenario)">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="field-label">后端地址</label>
              <input v-model="form.backendHost" type="text" placeholder="127.0.0.1" class="field-input" />
            </div>
            <div>
              <label class="field-label">后端端口</label>
              <input v-model="form.backendPort" type="text" placeholder="3000" class="field-input" />
            </div>
          </div>
          <template v-if="form.scenario === 'proxy'">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="field-label">连接超时（秒）</label>
                <input v-model="form.connectTimeout" type="text" placeholder="60" class="field-input" />
              </div>
              <div>
                <label class="field-label">读取超时（秒）</label>
                <input v-model="form.readTimeout" type="text" placeholder="60" class="field-input" />
              </div>
            </div>
          </template>
        </template>

        <!-- 静态站点参数 -->
        <template v-if="form.scenario === 'static'">
          <div>
            <label class="field-label">网站根目录</label>
            <input v-model="form.rootPath" type="text" placeholder="/var/www/html" class="field-input" />
          </div>
          <div>
            <label class="field-label">首页文件</label>
            <input v-model="form.indexFile" type="text" placeholder="index.html" class="field-input" />
          </div>
        </template>

        <!-- HTTPS 证书参数 -->
        <template v-if="form.scenario === 'https'">
          <div>
            <label class="field-label">SSL 证书路径（fullchain.pem）</label>
            <input v-model="form.sslCert" type="text" class="field-input" />
          </div>
          <div>
            <label class="field-label">SSL 私钥路径（privkey.pem）</label>
            <input v-model="form.sslKey" type="text" class="field-input" />
          </div>
        </template>

        <!-- 负载均衡参数 -->
        <template v-if="form.scenario === 'upstream'">
          <div>
            <label class="field-label">upstream 名称</label>
            <input v-model="form.upstreamName" type="text" placeholder="backend_pool" class="field-input" />
          </div>
          <div>
            <label class="field-label">后端节点列表（每行一个，格式：IP:端口）</label>
            <textarea v-model="form.upstreamNodes" rows="3" placeholder="127.0.0.1:3001&#10;127.0.0.1:3002" class="field-input resize-none"></textarea>
          </div>
          <div>
            <label class="field-label">负载策略</label>
            <select v-model="form.lbMethod" class="field-input">
              <option value="round_robin">轮询（默认）</option>
              <option value="ip_hash">IP Hash（同一IP固定后端）</option>
              <option value="least_conn">最少连接</option>
            </select>
          </div>
        </template>
      </div>

      <!-- 可选增强 -->
      <div class="bg-white dark:bg-slate-900/50 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1">可选增强</h3>

        <label class="toggle-row">
          <span class="toggle-label">Gzip 压缩</span>
          <input type="checkbox" v-model="form.enableGzip" class="sr-only" />
          <div :class="['toggle-thumb', form.enableGzip ? 'bg-accent' : 'bg-gray-300 dark:bg-slate-600']">
            <div :class="['toggle-dot', form.enableGzip ? 'translate-x-5' : 'translate-x-0']"></div>
          </div>
        </label>

        <label class="toggle-row">
          <span class="toggle-label">访问日志</span>
          <input type="checkbox" v-model="form.enableAccessLog" class="sr-only" />
          <div :class="['toggle-thumb', form.enableAccessLog ? 'bg-accent' : 'bg-gray-300 dark:bg-slate-600']">
            <div :class="['toggle-dot', form.enableAccessLog ? 'translate-x-5' : 'translate-x-0']"></div>
          </div>
        </label>

        <label class="toggle-row">
          <span class="toggle-label">CORS 跨域</span>
          <input type="checkbox" v-model="form.enableCors" class="sr-only" />
          <div :class="['toggle-thumb', form.enableCors ? 'bg-accent' : 'bg-gray-300 dark:bg-slate-600']">
            <div :class="['toggle-dot', form.enableCors ? 'translate-x-5' : 'translate-x-0']"></div>
          </div>
        </label>
        <div v-if="form.enableCors" class="pl-0">
          <label class="field-label">允许的 Origin（* 表示所有）</label>
          <input v-model="form.corsOrigin" type="text" placeholder="*" class="field-input" />
        </div>

        <template v-if="form.scenario === 'static'">
          <label class="toggle-row">
            <span class="toggle-label">静态资源缓存</span>
            <input type="checkbox" v-model="form.enableCache" class="sr-only" />
            <div :class="['toggle-thumb', form.enableCache ? 'bg-accent' : 'bg-gray-300 dark:bg-slate-600']">
              <div :class="['toggle-dot', form.enableCache ? 'translate-x-5' : 'translate-x-0']"></div>
            </div>
          </label>
          <div v-if="form.enableCache">
            <label class="field-label">缓存时间</label>
            <input v-model="form.cacheExpire" type="text" placeholder="30d" class="field-input" />
          </div>
        </template>
      </div>
    </div>

    <!-- 右侧：生成结果 -->
    <div class="flex flex-col gap-4">
      <!-- 操作按钮 -->
      <div class="flex items-center gap-3">
        <button
          @click="copyConfig"
          :class="[
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
            copied
              ? 'bg-green-500 text-white'
              : 'bg-accent text-white hover:bg-accent-dark'
          ]"
        >
          <svg v-if="!copied" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          {{ copied ? '已复制！' : '复制配置' }}
        </button>
        <button
          @click="downloadConfig"
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all duration-200"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          下载 .conf
        </button>
        <span class="text-xs text-gray-400 dark:text-slate-500 ml-auto">实时生成，修改参数即时更新</span>
      </div>

      <!-- 代码预览 -->
      <div class="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-slate-800/80 border-b border-gray-200 dark:border-slate-700">
          <div class="flex items-center gap-2">
            <div class="flex gap-1.5">
              <div class="w-3 h-3 rounded-full bg-red-400/70"></div>
              <div class="w-3 h-3 rounded-full bg-yellow-400/70"></div>
              <div class="w-3 h-3 rounded-full bg-green-400/70"></div>
            </div>
            <span class="text-xs text-gray-500 dark:text-slate-400 ml-1">{{ form.domain || 'example.com' }}.conf</span>
          </div>
          <span class="text-xs text-gray-400 dark:text-slate-600">nginx</span>
        </div>
        <pre class="overflow-auto p-4 text-sm leading-relaxed bg-slate-900 text-slate-200 min-h-[400px] max-h-[600px]"><code>{{ generatedConfig }}</code></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.field-label {
  @apply block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1;
}
.field-input {
  @apply w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all;
}
.toggle-row {
  @apply flex items-center justify-between cursor-pointer;
}
.toggle-label {
  @apply text-sm text-gray-600 dark:text-slate-400;
}
.toggle-thumb {
  @apply relative w-10 h-6 rounded-full transition-colors duration-200 flex-shrink-0;
}
.toggle-dot {
  @apply absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200;
}
</style>
