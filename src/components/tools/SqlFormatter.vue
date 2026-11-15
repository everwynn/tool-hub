<script setup lang="ts">
// ============================================================
// SqlFormatter — SQL 格式化工具（纯前端，不依赖外部库）
// ============================================================
// 功能：
// 1. 格式化 SQL（关键词大写 + 换行缩进）
// 2. 压缩 SQL（去除多余空白）
// 3. 支持 MySQL / PostgreSQL / SQLite 方言切换（主要影响关键词显示）
// 4. 一键复制 / 清空 / 示例
// ============================================================

import { ref, computed } from 'vue'

type Mode = 'format' | 'minify'
type Dialect = 'mysql' | 'postgresql' | 'sqlite'

const input = ref('')
const mode = ref<Mode>('format')
const dialect = ref<Dialect>('mysql')
const copied = ref(false)

const dialects = [
  { key: 'mysql' as Dialect,      label: 'MySQL' },
  { key: 'postgresql' as Dialect, label: 'PostgreSQL' },
  { key: 'sqlite' as Dialect,     label: 'SQLite' },
]

// SQL 关键词列表（按优先级长 → 短，避免短词误匹配）
const SQL_KEYWORDS = [
  'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
  'LIKE', 'BETWEEN', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
  'ON', 'AS', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
  'INSERT INTO', 'INSERT', 'INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE', 'DELETE FROM',
  'CREATE TABLE', 'CREATE INDEX', 'CREATE VIEW', 'CREATE',
  'DROP TABLE', 'DROP INDEX', 'DROP VIEW', 'DROP',
  'ALTER TABLE', 'ALTER', 'ADD COLUMN', 'ADD', 'COLUMN',
  'PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'INDEX', 'CONSTRAINT',
  'DEFAULT', 'NOT NULL', 'AUTO_INCREMENT', 'AUTOINCREMENT', 'SERIAL',
  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
  'WITH', 'RECURSIVE', 'EXPLAIN', 'ANALYZE',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'SAVEPOINT',
  'GRANT', 'REVOKE', 'TRUNCATE',
  'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'COALESCE', 'IFNULL', 'NULLIF',
  'CAST', 'CONVERT', 'DATE', 'NOW', 'CURDATE',
  'ASC', 'DESC', 'ALL', 'ANY', 'SOME',
]

// 需要换行的主要子句
const NEWLINE_BEFORE = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING',
  'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN',
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'CROSS JOIN',
  'ON', 'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
  'INSERT INTO', 'INSERT', 'VALUES', 'SET',
  'UPDATE', 'DELETE', 'DELETE FROM',
  'CREATE', 'CREATE TABLE', 'DROP', 'ALTER TABLE',
  'LIMIT', 'OFFSET',
])

// AND / OR 也换行（加缩进）
const INDENT_KEYWORDS = new Set(['AND', 'OR'])

const formatSql = (sql: string): string => {
  // 1. 统一空白
  let s = sql.trim().replace(/\s+/g, ' ')

  // 2. 关键词大写（带词边界）
  const keywordsSorted = [...SQL_KEYWORDS].sort((a, b) => b.length - a.length)
  for (const kw of keywordsSorted) {
    const re = new RegExp(`\\b${kw.replace(/ /g, '\\s+')}\\b`, 'gi')
    s = s.replace(re, kw)
  }

  // 3. 逗号后换行 + 缩进（列名列表、VALUES）
  s = s.replace(/,\s*/g, ',\n    ')

  // 4. 括号处理：左括号后不换行，右括号前换行
  s = s.replace(/\s*\(\s*/g, ' (')
  s = s.replace(/\s*\)\s*/g, ')')

  // 5. 主要子句换行
  for (const kw of NEWLINE_BEFORE) {
    const re = new RegExp(`\\b${kw.replace(/ /g, '\\s+')}\\b`, 'g')
    s = s.replace(re, `\n${kw}`)
  }

  // 6. AND / OR 换行 + 缩进
  for (const kw of INDENT_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'g')
    s = s.replace(re, `\n  ${kw}`)
  }

  // 7. 分号后换行
  s = s.replace(/;\s*/g, ';\n\n')

  // 8. 清理多余空行
  s = s.replace(/\n{3,}/g, '\n\n').trim()

  return s
}

const minifySql = (sql: string): string => {
  return sql.replace(/\s+/g, ' ').trim()
}

interface Result {
  ok: boolean
  output: string
  inputLines: number
  outputLines: number
}

const result = computed<Result>(() => {
  const raw = input.value
  if (!raw.trim()) return { ok: true, output: '', inputLines: 0, outputLines: 0 }

  const output = mode.value === 'format' ? formatSql(raw) : minifySql(raw)
  return {
    ok: true,
    output,
    inputLines: raw.split('\n').length,
    outputLines: output.split('\n').length,
  }
})

const copy = async () => {
  if (!result.value.output) return
  await navigator.clipboard.writeText(result.value.output)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const clear = () => { input.value = '' }

const demos: Record<Dialect, string> = {
  mysql: `select u.id,u.name,u.email,o.total from users u inner join orders o on u.id=o.user_id where u.status='active' and o.total>100 group by u.id order by o.total desc limit 20 offset 0`,
  postgresql: `select u.id,u.name,count(o.id) as order_count,sum(o.total) as total_spent from users u left join orders o on u.id=o.user_id where u.created_at>='2024-01-01' group by u.id,u.name having count(o.id)>5 order by total_spent desc limit 10`,
  sqlite: `create table if not exists posts (id integer primary key autoincrement,title text not null,content text,author_id integer,created_at datetime default current_timestamp,foreign key(author_id) references users(id))`,
}
const loadDemo = () => { input.value = demos[dialect.value] }
</script>

<template>
  <div class="space-y-4">
    <!-- 工具栏 -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- 模式 -->
      <div class="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        <button
          v-for="m in [{ key: 'format', label: '✨ 格式化' }, { key: 'minify', label: '📦 压缩' }]"
          :key="m.key"
          @click="mode = m.key as Mode"
          :class="[
            'px-4 py-2 text-sm font-medium transition-all border-r border-gray-200 dark:border-slate-700 last:border-r-0',
            mode === m.key
              ? 'bg-accent text-white'
              : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
          ]"
        >{{ m.label }}</button>
      </div>
      <!-- 方言 -->
      <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
        <span>方言：</span>
        <div class="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <button
            v-for="d in dialects" :key="d.key"
            @click="dialect = d.key"
            :class="[
              'px-3 py-2 text-xs font-medium transition-all border-r border-gray-200 dark:border-slate-700 last:border-r-0',
              dialect === d.key
                ? 'bg-slate-700 dark:bg-slate-600 text-white'
                : 'bg-white dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
            ]"
          >{{ d.label }}</button>
        </div>
      </div>
    </div>

    <!-- 双栏布局 -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <!-- 输入 -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500 dark:text-slate-500">输入 SQL</span>
          <div class="flex gap-2">
            <button @click="loadDemo" class="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">示例</button>
            <button @click="clear" class="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-red-300 hover:text-red-500 transition-all">清空</button>
          </div>
        </div>
        <textarea
          v-model="input"
          rows="18"
          placeholder="粘贴 SQL 语句..."
          class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none transition-all leading-relaxed"
          spellcheck="false"
        ></textarea>
      </div>

      <!-- 输出 -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-500 dark:text-slate-500">
            格式化结果
            <span v-if="result.output" class="ml-1 text-gray-400 dark:text-slate-600">
              {{ result.outputLines }} 行 · {{ result.output.length }} 字符
            </span>
          </span>
          <button
            @click="copy"
            :class="[
              'text-xs px-2.5 py-1 rounded border transition-all',
              copied
                ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent'
            ]"
          >{{ copied ? '已复制' : '复制' }}</button>
        </div>
        <pre class="flex-1 min-h-[400px] px-4 py-3 text-sm font-mono rounded-xl border border-slate-700 bg-slate-900 text-slate-200 overflow-auto whitespace-pre leading-relaxed"><code>{{ result.output || '格式化结果将显示在这里' }}</code></pre>
      </div>
    </div>
  </div>
</template>
