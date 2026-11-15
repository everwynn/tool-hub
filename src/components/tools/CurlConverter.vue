<script setup lang="ts">
// ============================================================
// CurlConverter — cURL 命令转代码
// 解析 cURL 参数（方法/URL/Header/Body/表单/认证），生成多语言请求代码
// ============================================================

import { ref, computed } from 'vue'

type Lang = 'fetch' | 'axios' | 'python' | 'go'

const input = ref('')
const lang = ref<Lang>('fetch')
const copied = ref(false)

const SAMPLE = `curl 'https://api.example.com/v1/users' \\
  -X POST \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.demo' \\
  -d '{"name":"Alice","age":25}'`

const langLabels: Record<Lang, string> = {
  fetch: 'JavaScript fetch',
  axios: 'axios',
  python: 'Python requests',
  go: 'Go net/http',
}

interface Parsed {
  method: string
  url: string
  headers: [string, string][]
  body?: string
  form: [string, string][]
  warnings: string[]
}

// ======================== 词法分析 ========================

/** 合并续行：反斜杠或 ^ 后跟换行 */
function preprocess(raw: string): string {
  return raw.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ')
}

/** shell 风格的简单分词：支持单引号、双引号、$'...' 与转义 */
function tokenize(s: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let hasCur = false
  let quote: '"' | "'" | null = null
  let ansi = false

  const escapeMap: Record<string, string> = {
    n: '\n', t: '\t', r: '\r', '"': '"', "'": "'", '\\': '\\', '$': '$', '`': '`', '0': '\0',
  }

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (ansi && c === '\\' && i + 1 < s.length) {
        const n = s[i + 1]
        cur += escapeMap[n] ?? `\\${n}`
        i++
        continue
      }
      if (!ansi && quote === '"' && c === '\\' && i + 1 < s.length) {
        const n = s[i + 1]
        cur += escapeMap[n] ?? `\\${n}`
        i++
        continue
      }
      if (c === quote) {
        quote = null
        continue
      }
      cur += c
      continue
    }
    if (c === '$' && s[i + 1] === "'") {
      quote = "'"
      ansi = true
      hasCur = true
      i++
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      ansi = false
      hasCur = true
      continue
    }
    if (/\s/.test(c)) {
      if (hasCur) {
        tokens.push(cur)
        cur = ''
        hasCur = false
      }
      continue
    }
    cur += c
    hasCur = true
  }
  if (hasCur) tokens.push(cur)
  return tokens
}

// ======================== 参数解析 ========================

const VALUE_OPTS: Record<string, string> = {
  '-X': 'method', '--request': 'method',
  '-H': 'header', '--header': 'header',
  '-d': 'body', '--data': 'body', '--data-raw': 'body', '--data-binary': 'body', '--data-ascii': 'body',
  '--json': 'json',
  '-F': 'form', '--form': 'form',
  '-u': 'auth', '--user': 'auth',
  '-b': 'cookie', '--cookie': 'cookie',
  '-A': 'ua', '--user-agent': 'ua',
  '-e': 'referer', '--referer': 'referer',
  '--url': 'url',
}

const FLAG_OPTS = new Set([
  '-I', '--head', '-L', '--location', '-k', '--insecure', '--compressed',
  '-s', '--silent', '-v', '--verbose', '-i', '--include', '-g', '--globoff', '--no-buffer',
])

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

function parseCurl(raw: string): Parsed | { error: string } {
  const tokens = tokenize(preprocess(raw))
  if (!tokens.length) return { error: '请输入 cURL 命令' }

  let start = 0
  if (/^curl(\.exe)?$/i.test(tokens[0])) start = 1

  let method = ''
  let url = ''
  let headOnly = false
  let auth = ''
  let cookie = ''
  let body: string | undefined
  let jsonBody = false
  const form: [string, string][] = []
  const headerPairs: [string, string][] = []
  const warnings: string[] = []

  const applyValue = (kind: string, val: string) => {
    switch (kind) {
      case 'method': method = val.toUpperCase(); break
      case 'url': url = val; break
      case 'header': {
        const i = val.indexOf(':')
        if (i > 0) headerPairs.push([val.slice(0, i).trim(), val.slice(i + 1).trim()])
        else warnings.push(`无效 Header 已忽略：${val}`)
        break
      }
      case 'body': body = body === undefined ? val : `${body}&${val}`; break
      case 'json': body = val; jsonBody = true; break
      case 'form': {
        const i = val.indexOf('=')
        if (i > 0) form.push([val.slice(0, i), val.slice(i + 1)])
        else form.push([val, ''])
        break
      }
      case 'auth': auth = val; break
      case 'cookie': cookie = val; break
      case 'ua': headerPairs.push(['User-Agent', val]); break
      case 'referer': headerPairs.push(['Referer', val]); break
    }
  }

  const shortWithValue = /^(-[XHdFubAe])(.+)$/

  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t.startsWith('-')) {
      if (!url) url = t
      else warnings.push(`多余的位置参数已忽略：${t}`)
      continue
    }
    if (VALUE_OPTS[t]) {
      const v = tokens[++i]
      if (v === undefined) { warnings.push(`${t} 缺少参数值`); continue }
      applyValue(VALUE_OPTS[t], v)
      continue
    }
    const m = t.match(shortWithValue)
    if (m && VALUE_OPTS[m[1]]) { applyValue(VALUE_OPTS[m[1]], m[2]); continue }
    if (FLAG_OPTS.has(t)) {
      if (t === '-I' || t === '--head') headOnly = true
      continue
    }
    warnings.push(`未识别参数已忽略：${t}`)
  }

  if (!url) return { error: '未找到 URL，请检查 cURL 命令' }
  if (!/^https?:\/\//i.test(url)) return { error: `仅支持 http(s) URL：${url}` }

  if (auth) {
    try {
      const hasAuth = headerPairs.some(([k]) => k.toLowerCase() === 'authorization')
      if (!hasAuth) headerPairs.push(['Authorization', `Basic ${b64(auth)}`])
    } catch {
      warnings.push('-u 认证信息编码失败，已忽略')
    }
  }
  if (cookie) headerPairs.push(['Cookie', cookie])
  if (jsonBody) headerPairs.push(['Content-Type', 'application/json'])
  if (form.length && body !== undefined) warnings.push('同时存在 -d 与 -F，已优先按表单生成')

  const dedup = new Map<string, [string, string]>()
  for (const [k, v] of headerPairs) dedup.set(k.toLowerCase(), [k, v])

  const inferred = method || (headOnly ? 'HEAD' : (body !== undefined || form.length ? 'POST' : 'GET'))

  return {
    method: inferred,
    url,
    headers: [...dedup.values()],
    body: form.length ? undefined : body,
    form,
    warnings,
  }
}

// ======================== 代码生成 ========================

function prettyJson(body: string): string | null {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return null
  }
}

function indentLines(text: string, pad: string): string {
  const lines = text.split('\n')
  return lines.map((l, i) => (i === 0 ? l : pad + l)).join('\n')
}

function genFetch(p: Parsed): string {
  const opts: string[] = [`  method: ${JSON.stringify(p.method)},`]
  if (p.headers.length) {
    opts.push('  headers: {')
    for (const [k, v] of p.headers) opts.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    opts.push('  },')
  }
  if (p.form.length) {
    const pre = ['const form = new FormData();']
    for (const [k, v] of p.form) pre.push(`form.append(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    const call = [`const res = await fetch(${JSON.stringify(p.url)}, {`, ...opts, '  body: form,', '});']
    return [...pre, '', ...call, '', 'const data = await res.json();', 'console.log(data);'].join('\n')
  }
  if (p.body !== undefined) {
    const json = prettyJson(p.body)
    opts.push(`  body: ${json ? `JSON.stringify(${indentLines(json, '  ')})` : JSON.stringify(p.body)},`)
  }
  return [
    `const res = await fetch(${JSON.stringify(p.url)}, {`,
    ...opts,
    '});',
    '',
    'const data = await res.json();',
    'console.log(data);',
  ].join('\n')
}

function genAxios(p: Parsed): string {
  const lines: string[] = ['import axios from "axios";', '']
  if (p.form.length) {
    lines.push('const form = new FormData();')
    for (const [k, v] of p.form) lines.push(`form.append(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    lines.push('')
  }
  lines.push('const res = await axios({')
  lines.push(`  method: ${JSON.stringify(p.method.toLowerCase())},`)
  lines.push(`  url: ${JSON.stringify(p.url)},`)
  if (p.headers.length) {
    lines.push('  headers: {')
    for (const [k, v] of p.headers) lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    lines.push('  },')
  }
  if (p.form.length) {
    lines.push('  data: form,')
  } else if (p.body !== undefined) {
    const json = prettyJson(p.body)
    lines.push(`  data: ${json ? indentLines(json, '  ') : JSON.stringify(p.body)},`)
  }
  lines.push('});', '', 'console.log(res.data);')
  return lines.join('\n')
}

function pyLiteral(v: unknown): string {
  if (v === null) return 'None'
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(pyLiteral).join(', ')}]`
  return `{${Object.entries(v as Record<string, unknown>).map(([k, val]) => `${JSON.stringify(k)}: ${pyLiteral(val)}`).join(', ')}}`
}

function genPython(p: Parsed): string {
  const lines: string[] = ['import requests', '']
  lines.push(`url = ${JSON.stringify(p.url)}`)
  lines.push(`method = ${JSON.stringify(p.method)}`)
  if (p.headers.length) {
    lines.push('headers = {')
    for (const [k, v] of p.headers) lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    lines.push('}')
  }
  const json = p.body !== undefined ? prettyJson(p.body) : null
  let bodyArg = ''
  if (p.form.length) {
    lines.push('files = {')
    for (const [k, v] of p.form) lines.push(`    ${JSON.stringify(k)}: (None, ${JSON.stringify(v)}),`)
    lines.push('}')
    bodyArg = ', files=files'
  } else if (p.body !== undefined) {
    if (json) {
      const parsed = JSON.parse(p.body as string)
      lines.push(`payload = ${pyLiteral(parsed)}`)
      bodyArg = ', json=payload'
    } else {
      lines.push(`data = ${JSON.stringify(p.body)}`)
      bodyArg = ', data=data'
    }
  }
  lines.push('')
  lines.push(`res = requests.request(method, url, headers=headers${bodyArg})`)
  lines.push('print(res.status_code)')
  lines.push('print(res.text)')
  return lines.join('\n')
}

function genGo(p: Parsed): string {
  const bodyRaw = p.body
  const useBacktick = bodyRaw !== undefined && !bodyRaw.includes('`')
  const payloadExpr = bodyRaw === undefined
    ? 'nil'
    : useBacktick
      ? `strings.NewReader(\`${bodyRaw}\`)`
      : `strings.NewReader(${JSON.stringify(bodyRaw)})`

  const importSet = new Set(['fmt', 'io', 'net/http'])
  if (bodyRaw !== undefined) importSet.add('strings')
  const imports = [...importSet].map((m) => `\t"${m}"`).join('\n')

  const lines: string[] = [
    'package main',
    '',
    'import (',
    imports,
    ')',
    '',
    'func main() {',
    `\turl := ${JSON.stringify(p.url)}`,
  ]
  if (bodyRaw !== undefined) lines.push(`\tpayload := ${payloadExpr}`)
  lines.push(`\treq, err := http.NewRequest(${JSON.stringify(p.method)}, url, ${bodyRaw === undefined ? 'nil' : 'payload'})`)
  lines.push('\tif err != nil {', '\t\tpanic(err)', '\t}')
  for (const [k, v] of p.headers) lines.push(`\treq.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
  lines.push('')
  lines.push('\tres, err := http.DefaultClient.Do(req)')
  lines.push('\tif err != nil {', '\t\tpanic(err)', '\t}')
  lines.push('\tdefer res.Body.Close()')
  lines.push('')
  lines.push('\tbody, err := io.ReadAll(res.Body)')
  lines.push('\tif err != nil {', '\t\tpanic(err)', '\t}')
  lines.push('\tfmt.Println(res.Status)')
  lines.push('\tfmt.Println(string(body))')
  lines.push('}')
  return lines.join('\n')
}

// ======================== 计算输出 ========================

const parsed = computed(() => {
  if (!input.value.trim()) return null
  return parseCurl(input.value)
})

const error = computed(() => {
  const p = parsed.value
  return p && 'error' in p ? p.error : ''
})

const warnings = computed(() => {
  const p = parsed.value
  return p && !('error' in p) ? p.warnings : []
})

const output = computed(() => {
  const p = parsed.value
  if (!p || 'error' in p) return ''
  if (p.form.length && lang.value === 'go') {
    return '// Go 代码生成暂不支持 -F 表单，请改用其他语言或手动构造 multipart 请求'
  }
  switch (lang.value) {
    case 'fetch': return genFetch(p)
    case 'axios': return genAxios(p)
    case 'python': return genPython(p)
    case 'go': return genGo(p)
  }
})

const copy = async () => {
  if (!output.value) return
  await navigator.clipboard.writeText(output.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <div class="space-y-5">
    <!-- 输入 -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">cURL 命令</span>
        <div class="flex gap-2">
          <button @click="input = SAMPLE" class="text-xs px-2.5 py-0.5 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">加载示例</button>
          <button @click="input = ''" class="text-xs px-2.5 py-0.5 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/40 hover:text-accent transition-all">清空</button>
        </div>
      </div>
      <textarea
        v-model="input"
        spellcheck="false"
        placeholder="粘贴 cURL 命令，支持反斜杠续行，例如：&#10;curl 'https://api.example.com/users' \\&#10;  -H 'Content-Type: application/json' \\&#10;  -d '{&quot;name&quot;:&quot;Alice&quot;}'"
        class="w-full h-44 px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none leading-relaxed"
      ></textarea>
      <div v-if="error" class="mt-1.5 text-xs text-red-500 dark:text-red-400">{{ error }}</div>
      <div v-else-if="warnings.length" class="mt-1.5 space-y-0.5">
        <div v-for="w in warnings" :key="w" class="text-xs text-amber-600 dark:text-amber-400">提示：{{ w }}</div>
      </div>
    </div>

    <!-- 语言切换 -->
    <div class="flex flex-wrap gap-2">
      <button
        v-for="l in (['fetch', 'axios', 'python', 'go'] as Lang[])"
        :key="l"
        @click="lang = l"
        :class="['px-4 py-2 text-sm font-medium rounded-xl border transition-all', lang === l
          ? 'bg-accent text-white border-accent'
          : 'bg-white dark:bg-slate-900/50 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40']"
      >{{ langLabels[l] }}</button>
    </div>

    <!-- 输出 -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-semibold text-gray-500 dark:text-slate-400">生成的代码</span>
        <button
          @click="copy"
          :disabled="!output"
          :class="['text-xs px-2.5 py-0.5 rounded border transition-all', output
            ? (copied ? 'border-green-400 text-green-600 dark:text-green-400' : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/40 hover:text-accent')
            : 'border-gray-100 dark:border-slate-800 text-gray-300 dark:text-slate-700 cursor-not-allowed']"
        >{{ copied ? '已复制' : '复制' }}</button>
      </div>
      <pre class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 text-gray-800 dark:text-slate-200 overflow-auto min-h-[16rem] max-h-[32rem] leading-relaxed"><code>{{ output || '// 输入 cURL 命令后自动生成代码' }}</code></pre>
    </div>

    <!-- 说明 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4">
      <h3 class="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-2">支持的参数</h3>
      <ul class="text-xs text-gray-500 dark:text-slate-500 space-y-1 list-disc list-inside">
        <li>-X/--request、-H/--header、-d/--data*、--json、-F/--form、-u/--user、-b/--cookie、-A、-e、--url</li>
        <li>-I/--head、-L、-k、--compressed 等无值参数识别后忽略；-d 自动推断 POST，-u 自动生成 Basic 认证</li>
        <li>支持单引号、双引号与 $'...' 转义，反斜杠续行自动合并；未识别参数会提示但不会中断转换</li>
      </ul>
    </div>
  </div>
</template>
