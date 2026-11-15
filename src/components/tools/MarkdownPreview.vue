<script setup lang="ts">
// ============================================================
// MarkdownPreview — Markdown 实时预览（纯 JS 渲染）
// ============================================================

import { ref, computed } from 'vue'

const defaultMd = `# Markdown 预览器

这里是一个**实时预览**的 Markdown 编辑器，支持 _GFM（GitHub Flavored Markdown）_ 的常用语法。

## 文字样式

**粗体文字** 和 *斜体文字*，也可以 ~~删除线~~ 或 \`行内代码\`。

## 列表

### 无序列表
- 第一项
  - 嵌套子项
  - 另一个子项
- 第二项

### 有序列表
1. 启动服务
2. 检查日志
3. 验证结果

## 代码块

\`\`\`bash
# 启动 Docker 容器
docker run -d \\
  --name nginx \\
  -p 80:80 \\
  nginx:alpine
\`\`\`

\`\`\`javascript
const greet = (name) => \`Hello, \${name}!\`
console.log(greet('World'))
\`\`\`

## 表格

| 名称 | 端口 | 协议 |
|------|------|------|
| Nginx | 80/443 | TCP |
| MySQL | 3306 | TCP |
| Redis | 6379 | TCP |

## 引用

> 这是一段引用文字。
> 可以跨越多行。

## 链接与图片

[GitHub](https://github.com) 是最大的代码托管平台。

## 分割线

---

**提示：** 左侧输入 Markdown，右侧实时渲染预览。
`

const mdInput = ref(defaultMd)
const syncScroll = ref(true)
const copied = ref(false)

// ============================================================
// 简版 Markdown → HTML 渲染器（支持 GFM 常用语法）
// ============================================================
function renderMarkdown(md: string): string {
  let html = md

  // 转义 HTML 特殊字符（在代码块处理前保护内容）
  const codeBlocks: string[] = []
  // 先提取代码块，防止内部被处理
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    codeBlocks.push(`<pre class="md-pre"><code class="language-${lang || 'text'}">${escaped}</code></pre>`)
    return `\x00CODE${codeBlocks.length - 1}\x00`
  })

  // 行内代码
  const inlineCodes: string[] = []
  html = html.replace(/`([^`\n]+)`/g, (_m, code) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    inlineCodes.push(`<code class="md-code">${escaped}</code>`)
    return `\x01INLINE${inlineCodes.length - 1}\x01`
  })

  // 标题
  html = html.replace(/^###### (.+)$/gm, '<h6 class="md-h6">$1</h6>')
  html = html.replace(/^##### (.+)$/gm, '<h5 class="md-h5">$1</h5>')
  html = html.replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')

  // 分割线
  html = html.replace(/^---+$/gm, '<hr class="md-hr"/>')

  // 表格
  html = html.replace(/((?:^\|.+\|\n)+)/gm, (tableBlock) => {
    const rows = tableBlock.trim().split('\n')
    if (rows.length < 2) return tableBlock
    const header = rows[0].split('|').filter(c => c.trim() !== '').map(c => `<th class="md-th">${c.trim()}</th>`).join('')
    const body = rows.slice(2).map(row => {
      const cells = row.split('|').filter(c => c.trim() !== '').map(c => `<td class="md-td">${c.trim()}</td>`).join('')
      return `<tr>${cells}</tr>`
    }).join('\n')
    return `<table class="md-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`
  })

  // 引用块
  html = html.replace(/((?:^> .+\n?)+)/gm, (block) => {
    const content = block.replace(/^> /gm, '').trimEnd()
    return `<blockquote class="md-blockquote">${content}</blockquote>\n`
  })

  // 无序列表（简化：不支持深层嵌套）
  html = html.replace(/((?:^[ \t]*[-*+] .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(line => {
      const depth = (line.match(/^(\s*)/)?.[1].length ?? 0) / 2
      const text = line.replace(/^[ \t]*[-*+] /, '')
      return `<li style="margin-left:${depth * 1.2}rem">${text}</li>`
    }).join('')
    return `<ul class="md-ul">${items}</ul>\n`
  })

  // 有序列表
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(line => `<li>${line.replace(/^\d+\. /, '')}</li>`).join('')
    return `<ol class="md-ol">${items}</ol>\n`
  })

  // 粗体 + 斜体
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold">$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em class="md-em">$1</em>')
  html = html.replace(/_(.+?)_/g, '<em class="md-em">$1</em>')
  // 删除线
  html = html.replace(/~~(.+?)~~/g, '<del class="md-del">$1</del>')

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-a" href="$2" target="_blank" rel="noopener">$1</a>')

  // 段落：连续非标签行 → <p>
  const lines = html.split('\n')
  const result: string[] = []
  let pBuffer: string[] = []

  const flushP = () => {
    if (pBuffer.length) {
      const text = pBuffer.join(' ').trim()
      if (text) result.push(`<p class="md-p">${text}</p>`)
      pBuffer = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushP()
    } else if (/^<(h[1-6]|ul|ol|blockquote|table|hr|pre)/.test(trimmed) || /^<\/(ul|ol|blockquote|table)>/.test(trimmed)) {
      flushP()
      result.push(line)
    } else {
      pBuffer.push(line)
    }
  }
  flushP()
  html = result.join('\n')

  // 恢复代码块和行内代码
  html = html.replace(/\x00CODE(\d+)\x00/g, (_m, i) => codeBlocks[parseInt(i)])
  html = html.replace(/\x01INLINE(\d+)\x01/g, (_m, i) => inlineCodes[parseInt(i)])

  return html
}

const rendered = computed(() => renderMarkdown(mdInput.value))

const copyMarkdown = async () => {
  await navigator.clipboard.writeText(mdInput.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const wordCount = computed(() => {
  const text = mdInput.value.replace(/```[\s\S]*?```/g, '').replace(/[#*`_~\[\]()>|-]/g, '')
  const cn = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const en = (text.match(/\b[a-zA-Z]+\b/g) || []).length
  return { cn, en, total: cn + en }
})
</script>

<template>
  <div class="space-y-4">
    <!-- 工具栏 -->
    <div class="flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400 cursor-pointer select-none">
        <input type="checkbox" v-model="syncScroll" class="w-3.5 h-3.5 accent-accent" />
        同步滚动
      </label>
      <div class="text-xs text-gray-400 dark:text-slate-600">
        中文 {{ wordCount.cn }} 字 · 英文 {{ wordCount.en }} 词
      </div>
      <div class="ml-auto flex gap-2">
        <button @click="copyMarkdown" :class="['text-xs px-3 py-1.5 rounded-lg border transition-all', copied ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']">
          {{ copied ? '已复制 MD' : '复制 MD' }}
        </button>
        <button @click="mdInput = ''" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-red-300 hover:text-red-500 transition-all">清空</button>
      </div>
    </div>

    <!-- 双栏编辑器 -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4" style="height:70vh;min-height:500px">
      <!-- 输入 -->
      <div class="flex flex-col gap-1 h-full">
        <span class="text-xs font-medium text-gray-500 dark:text-slate-500">Markdown 输入</span>
        <textarea
          v-model="mdInput"
          class="flex-1 px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none leading-relaxed"
          spellcheck="false"
          placeholder="在此输入 Markdown..."
        ></textarea>
      </div>

      <!-- 预览 -->
      <div class="flex flex-col gap-1 h-full">
        <span class="text-xs font-medium text-gray-500 dark:text-slate-500">预览</span>
        <div
          class="flex-1 overflow-auto px-6 py-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 prose-md"
          v-html="rendered"
        ></div>
      </div>
    </div>
  </div>
</template>

<style>
/* Markdown 渲染样式 */
.prose-md .md-h1 { font-size: 1.75rem; font-weight: 700; margin: 1.2rem 0 0.6rem; padding-bottom: 0.3rem; border-bottom: 2px solid #e5e7eb; color: inherit; }
.dark .prose-md .md-h1 { border-color: #334155; }
.prose-md .md-h2 { font-size: 1.35rem; font-weight: 700; margin: 1rem 0 0.5rem; padding-bottom: 0.2rem; border-bottom: 1px solid #e5e7eb; color: inherit; }
.dark .prose-md .md-h2 { border-color: #334155; }
.prose-md .md-h3 { font-size: 1.15rem; font-weight: 600; margin: 0.8rem 0 0.4rem; color: inherit; }
.prose-md .md-h4, .prose-md .md-h5, .prose-md .md-h6 { font-size: 1rem; font-weight: 600; margin: 0.6rem 0 0.3rem; color: inherit; }
.prose-md .md-p { margin: 0.5rem 0; line-height: 1.7; color: #374151; }
.dark .prose-md .md-p { color: #cbd5e1; }
.prose-md .md-bold { font-weight: 700; }
.prose-md .md-em { font-style: italic; }
.prose-md .md-del { text-decoration: line-through; opacity: 0.6; }
.prose-md .md-a { color: #6366f1; text-decoration: underline; }
.prose-md .md-a:hover { opacity: 0.8; }
.prose-md .md-hr { border: none; border-top: 2px solid #e5e7eb; margin: 1.2rem 0; }
.dark .prose-md .md-hr { border-color: #334155; }
.prose-md .md-ul, .prose-md .md-ol { padding-left: 1.5rem; margin: 0.5rem 0; }
.prose-md .md-ul { list-style-type: disc; }
.prose-md .md-ol { list-style-type: decimal; }
.prose-md .md-ul li, .prose-md .md-ol li { margin: 0.2rem 0; line-height: 1.6; color: #374151; }
.dark .prose-md .md-ul li, .dark .prose-md .md-ol li { color: #cbd5e1; }
.prose-md .md-blockquote { border-left: 4px solid #6366f1; padding: 0.5rem 1rem; margin: 0.8rem 0; background: #f8f8ff; border-radius: 0 0.5rem 0.5rem 0; }
.dark .prose-md .md-blockquote { background: #1e293b; }
.prose-md .md-code { font-family: 'Fira Mono', monospace; font-size: 0.82em; background: #f1f5f9; color: #e11d48; padding: 0.15em 0.45em; border-radius: 0.3rem; }
.dark .prose-md .md-code { background: #1e293b; color: #f472b6; }
.prose-md .md-pre { background: #0f172a; color: #e2e8f0; padding: 1rem 1.2rem; border-radius: 0.75rem; overflow-x: auto; margin: 0.8rem 0; font-size: 0.83rem; line-height: 1.6; }
.prose-md .md-pre code { background: transparent; color: inherit; padding: 0; border-radius: 0; font-size: inherit; }
.prose-md .md-table { width: 100%; border-collapse: collapse; margin: 0.8rem 0; font-size: 0.9rem; }
.prose-md .md-th { background: #f8fafc; font-weight: 600; padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; text-align: left; }
.dark .prose-md .md-th { background: #1e293b; border-color: #334155; color: #e2e8f0; }
.prose-md .md-td { padding: 0.4rem 0.75rem; border: 1px solid #e2e8f0; color: #374151; }
.dark .prose-md .md-td { border-color: #334155; color: #cbd5e1; }
.prose-md .md-table tr:nth-child(even) .md-td { background: #f8fafc; }
.dark .prose-md .md-table tr:nth-child(even) .md-td { background: #1e293b; }
</style>
