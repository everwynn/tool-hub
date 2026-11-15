<script setup lang="ts">
// ============================================================
// DockerComposeConverter — docker run 命令 → docker-compose.yml
// ============================================================

import { ref, computed } from 'vue'

const input   = ref('')
const copied  = ref(false)
const error   = ref('')

// ============================================================
// 解析 docker run 命令
// ============================================================
interface DockerRunConfig {
  image: string
  name: string
  ports: string[]
  envs: string[]
  volumes: string[]
  networks: string[]
  labels: string[]
  restart: string
  command: string
  entrypoint: string
  workdir: string
  user: string
  hostname: string
  privileged: boolean
  capAdd: string[]
  capDrop: string[]
  memLimit: string
  cpus: string
  extraHosts: string[]
  links: string[]
  dependsOn: string[]
  shmSize: string
  tty: boolean
  stdinOpen: boolean
  envFile: string[]
}

function tokenize(cmd: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < cmd.length) {
    // 跳过空白
    while (i < cmd.length && /\s/.test(cmd[i])) i++
    if (i >= cmd.length) break
    // 行继续符 \
    if (cmd[i] === '\\' && /\s/.test(cmd[i + 1] || '')) { i += 2; continue }
    // 带引号的 token
    if (cmd[i] === '"' || cmd[i] === "'") {
      const q = cmd[i++]
      let token = ''
      while (i < cmd.length && cmd[i] !== q) {
        if (cmd[i] === '\\' && cmd[i + 1]) { token += cmd[i + 1]; i += 2 } else { token += cmd[i++] }
      }
      i++ // 跳过结束引号
      tokens.push(token)
    } else {
      let token = ''
      while (i < cmd.length && !/\s/.test(cmd[i]) && cmd[i] !== '\\') token += cmd[i++]
      if (token) tokens.push(token)
    }
  }
  return tokens
}

function parseDockerRun(cmdRaw: string): DockerRunConfig {
  // 清理多行拼接
  const cmd = cmdRaw.replace(/\\\s*\n\s*/g, ' ').trim()
  const tokens = tokenize(cmd)

  const cfg: DockerRunConfig = {
    image: '', name: '', ports: [], envs: [], volumes: [], networks: [],
    labels: [], restart: '', command: '', entrypoint: '', workdir: '', user: '',
    hostname: '', privileged: false, capAdd: [], capDrop: [], memLimit: '', cpus: '',
    extraHosts: [], links: [], dependsOn: [], shmSize: '', tty: false, stdinOpen: false, envFile: [],
  }

  // 跳过 docker run
  let i = 0
  if (tokens[i] === 'docker') i++
  if (tokens[i] === 'run') i++

  const next = () => tokens[++i]
  const peek = () => tokens[i + 1]

  while (i < tokens.length) {
    const tok = tokens[i]
    if (tok === '--name') { cfg.name = next(); i++; continue }
    if (tok.startsWith('--name=')) { cfg.name = tok.slice(7); i++; continue }
    if (tok === '-p' || tok === '--publish') { cfg.ports.push(next()); i++; continue }
    if (tok.startsWith('-p=') || tok.startsWith('--publish=')) { cfg.ports.push(tok.split('=')[1]); i++; continue }
    if (tok === '-e' || tok === '--env') { cfg.envs.push(next()); i++; continue }
    if (tok.startsWith('--env=')) { cfg.envs.push(tok.slice(6)); i++; continue }
    if (tok === '--env-file') { cfg.envFile.push(next()); i++; continue }
    if (tok.startsWith('--env-file=')) { cfg.envFile.push(tok.slice(11)); i++; continue }
    if (tok === '-v' || tok === '--volume') { cfg.volumes.push(next()); i++; continue }
    if (tok.startsWith('--volume=')) { cfg.volumes.push(tok.slice(9)); i++; continue }
    if (tok === '--network') { cfg.networks.push(next()); i++; continue }
    if (tok.startsWith('--network=')) { cfg.networks.push(tok.slice(10)); i++; continue }
    if (tok === '--restart') { cfg.restart = next(); i++; continue }
    if (tok.startsWith('--restart=')) { cfg.restart = tok.slice(10); i++; continue }
    if (tok === '--entrypoint') { cfg.entrypoint = next(); i++; continue }
    if (tok.startsWith('--entrypoint=')) { cfg.entrypoint = tok.slice(13); i++; continue }
    if (tok === '-w' || tok === '--workdir') { cfg.workdir = next(); i++; continue }
    if (tok.startsWith('--workdir=')) { cfg.workdir = tok.slice(10); i++; continue }
    if (tok === '-u' || tok === '--user') { cfg.user = next(); i++; continue }
    if (tok.startsWith('--user=')) { cfg.user = tok.slice(7); i++; continue }
    if (tok === '-h' || tok === '--hostname') { cfg.hostname = next(); i++; continue }
    if (tok.startsWith('--hostname=')) { cfg.hostname = tok.slice(11); i++; continue }
    if (tok === '--privileged') { cfg.privileged = true; i++; continue }
    if (tok === '--cap-add') { cfg.capAdd.push(next()); i++; continue }
    if (tok.startsWith('--cap-add=')) { cfg.capAdd.push(tok.slice(10)); i++; continue }
    if (tok === '--cap-drop') { cfg.capDrop.push(next()); i++; continue }
    if (tok.startsWith('--cap-drop=')) { cfg.capDrop.push(tok.slice(11)); i++; continue }
    if (tok === '-m' || tok === '--memory') { cfg.memLimit = next(); i++; continue }
    if (tok.startsWith('--memory=')) { cfg.memLimit = tok.slice(9); i++; continue }
    if (tok.startsWith('--cpus=')) { cfg.cpus = tok.slice(7); i++; continue }
    if (tok === '--cpus') { cfg.cpus = next(); i++; continue }
    if (tok === '--add-host') { cfg.extraHosts.push(next()); i++; continue }
    if (tok.startsWith('--add-host=')) { cfg.extraHosts.push(tok.slice(11)); i++; continue }
    if (tok === '--link') { cfg.links.push(next()); i++; continue }
    if (tok.startsWith('--link=')) { cfg.links.push(tok.slice(7)); i++; continue }
    if (tok === '--shm-size') { cfg.shmSize = next(); i++; continue }
    if (tok.startsWith('--shm-size=')) { cfg.shmSize = tok.slice(11); i++; continue }
    if (tok === '-l' || tok === '--label') { cfg.labels.push(next()); i++; continue }
    if (tok.startsWith('--label=')) { cfg.labels.push(tok.slice(8)); i++; continue }
    if (tok === '-t' || tok === '--tty') { cfg.tty = true; i++; continue }
    if (tok === '-i' || tok === '--interactive') { cfg.stdinOpen = true; i++; continue }
    // 组合短选项（如 -it -d -dit）
    if (tok.startsWith('-') && !tok.startsWith('--')) {
      if (tok.includes('t')) cfg.tty = true
      if (tok.includes('i')) cfg.stdinOpen = true
      i++; continue
    }
    // image（第一个非 flag token）
    if (!tok.startsWith('-') && !cfg.image) {
      cfg.image = tok
      i++
      // 之后的 token 是 command
      const remaining = tokens.slice(i)
      if (remaining.length) cfg.command = remaining.join(' ')
      break
    }
    i++
  }
  return cfg
}

// ============================================================
// 生成 docker-compose.yml
// ============================================================
function generateCompose(cfg: DockerRunConfig): string {
  const svcName = cfg.name || cfg.image.split('/').pop()?.split(':')[0] || 'app'
  const lines: string[] = []

  lines.push('version: "3.8"')
  lines.push('services:')
  lines.push(`  ${svcName}:`)
  lines.push(`    image: ${cfg.image}`)

  if (cfg.name) lines.push(`    container_name: ${cfg.name}`)
  if (cfg.hostname) lines.push(`    hostname: ${cfg.hostname}`)
  if (cfg.restart) lines.push(`    restart: ${cfg.restart}`)
  if (cfg.workdir) lines.push(`    working_dir: ${cfg.workdir}`)
  if (cfg.user) lines.push(`    user: "${cfg.user}"`)
  if (cfg.privileged) lines.push('    privileged: true')
  if (cfg.tty) lines.push('    tty: true')
  if (cfg.stdinOpen) lines.push('    stdin_open: true')
  if (cfg.entrypoint) lines.push(`    entrypoint: ${cfg.entrypoint}`)
  if (cfg.command) lines.push(`    command: ${cfg.command}`)

  if (cfg.ports.length) {
    lines.push('    ports:')
    cfg.ports.forEach(p => lines.push(`      - "${p}"`))
  }
  if (cfg.envs.length) {
    lines.push('    environment:')
    cfg.envs.forEach(e => {
      if (e.includes('=')) {
        const [k, ...vparts] = e.split('=')
        lines.push(`      ${k}: "${vparts.join('=')}"`)
      } else {
        lines.push(`      - ${e}`)
      }
    })
  }
  if (cfg.envFile.length) {
    lines.push('    env_file:')
    cfg.envFile.forEach(f => lines.push(`      - ${f}`))
  }
  if (cfg.volumes.length) {
    lines.push('    volumes:')
    cfg.volumes.forEach(v => lines.push(`      - ${v}`))
  }
  if (cfg.networks.length) {
    lines.push('    networks:')
    cfg.networks.forEach(n => lines.push(`      - ${n}`))
  }
  if (cfg.labels.length) {
    lines.push('    labels:')
    cfg.labels.forEach(l => lines.push(`      - "${l}"`))
  }
  if (cfg.capAdd.length) {
    lines.push('    cap_add:')
    cfg.capAdd.forEach(c => lines.push(`      - ${c}`))
  }
  if (cfg.capDrop.length) {
    lines.push('    cap_drop:')
    cfg.capDrop.forEach(c => lines.push(`      - ${c}`))
  }
  if (cfg.extraHosts.length) {
    lines.push('    extra_hosts:')
    cfg.extraHosts.forEach(h => lines.push(`      - "${h}"`))
  }
  if (cfg.links.length) {
    lines.push('    links:')
    cfg.links.forEach(l => lines.push(`      - ${l}`))
  }
  if (cfg.shmSize) lines.push(`    shm_size: "${cfg.shmSize}"`)

  // 资源限制
  if (cfg.memLimit || cfg.cpus) {
    lines.push('    deploy:')
    lines.push('      resources:')
    lines.push('        limits:')
    if (cfg.memLimit) lines.push(`          memory: ${cfg.memLimit}`)
    if (cfg.cpus) lines.push(`          cpus: "${cfg.cpus}"`)
  }

  // networks 顶层声明
  if (cfg.networks.length) {
    lines.push('')
    lines.push('networks:')
    cfg.networks.forEach(n => { lines.push(`  ${n}:`) })
  }

  return lines.join('\n')
}

const result = computed(() => {
  error.value = ''
  const raw = input.value.trim()
  if (!raw) return ''
  try {
    const cfg = parseDockerRun(raw)
    if (!cfg.image) { error.value = '未能识别镜像名称，请确认命令格式正确'; return '' }
    return generateCompose(cfg)
  } catch (e) {
    error.value = `解析失败：${e instanceof Error ? e.message : String(e)}`
    return ''
  }
})

const copy = async () => {
  if (!result.value) return
  await navigator.clipboard.writeText(result.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const download = () => {
  if (!result.value) return
  const blob = new Blob([result.value], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'docker-compose.yml'; a.click()
  URL.revokeObjectURL(url)
}

const examples = [
  {
    label: 'Nginx 反向代理',
    cmd: `docker run -d \\
  --name nginx \\
  --restart always \\
  -p 80:80 \\
  -p 443:443 \\
  -v /etc/nginx/nginx.conf:/etc/nginx/nginx.conf \\
  -v /var/log/nginx:/var/log/nginx \\
  nginx:alpine`,
  },
  {
    label: 'MySQL 8',
    cmd: `docker run -d \\
  --name mysql8 \\
  --restart unless-stopped \\
  -p 3306:3306 \\
  -e MYSQL_ROOT_PASSWORD=secret \\
  -e MYSQL_DATABASE=myapp \\
  -v mysql_data:/var/lib/mysql \\
  mysql:8.0`,
  },
  {
    label: 'Redis 持久化',
    cmd: `docker run -d \\
  --name redis \\
  --restart always \\
  -p 6379:6379 \\
  -v redis_data:/data \\
  --memory 512m \\
  redis:7-alpine redis-server --appendonly yes`,
  },
]
</script>

<template>
  <div class="space-y-5">
    <!-- 示例快选 -->
    <div class="flex flex-wrap gap-2 items-center">
      <span class="text-xs text-gray-500 dark:text-slate-500">快速示例：</span>
      <button v-for="ex in examples" :key="ex.label" @click="input = ex.cmd"
        class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all bg-white dark:bg-slate-900/50"
      >{{ ex.label }}</button>
      <button @click="input = ''" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:border-red-300 hover:text-red-500 transition-all ml-auto">清空</button>
    </div>

    <!-- 双栏 -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <!-- 输入 -->
      <div class="flex flex-col gap-2">
        <span class="text-xs font-medium text-gray-500 dark:text-slate-500">docker run 命令（支持多行 \\ 换行）</span>
        <textarea
          v-model="input"
          rows="18"
          placeholder="docker run -d \&#10;  --name nginx \&#10;  -p 80:80 \&#10;  nginx:alpine"
          class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none leading-relaxed"
          spellcheck="false"
        ></textarea>
      </div>

      <!-- 输出 -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-gray-500 dark:text-slate-500">docker-compose.yml</span>
          <div class="flex gap-2">
            <button @click="copy" :class="['text-xs px-2.5 py-1 rounded-lg border transition-all', copied ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']">
              {{ copied ? '已复制' : '复制' }}
            </button>
            <button @click="download" :disabled="!result" class="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              下载
            </button>
          </div>
        </div>

        <div v-if="error" class="text-xs text-red-500 dark:text-red-400 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">{{ error }}</div>

        <pre class="flex-1 min-h-[420px] px-4 py-3 text-sm font-mono rounded-xl border border-slate-700 bg-slate-900 text-slate-200 overflow-auto whitespace-pre leading-relaxed"><code>{{ result || '转换结果将显示在这里' }}</code></pre>
      </div>
    </div>

    <!-- 支持说明 -->
    <div class="text-xs text-gray-400 dark:text-slate-600">
      支持参数：<code class="text-xs">--name -p --publish -e --env -v --volume --network --restart --entrypoint -w --user -h --privileged --cap-add --cap-drop -m --memory --cpus --add-host --link --shm-size -l --label --env-file -t -i</code>
    </div>
  </div>
</template>
