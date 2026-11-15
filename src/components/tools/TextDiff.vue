<script setup lang="ts">
// ============================================================
// TextDiff — 文本 Diff 对比（LCS 算法，逐行对比）
// ============================================================

import { ref, computed } from 'vue'

const leftText  = ref('')
const rightText = ref('')
const ignoreWhitespace = ref(false)
const ignoreCase = ref(false)

type DiffLine = {
  type: 'equal' | 'added' | 'removed' | 'modified'
  left?: string
  right?: string
  leftNum?: number
  rightNum?: number
}

function normalize(line: string): string {
  let s = line
  if (ignoreWhitespace.value) s = s.trim().replace(/\s+/g, ' ')
  if (ignoreCase.value) s = s.toLowerCase()
  return s
}

// LCS 算法
function computeDiff(): DiffLine[] {
  const leftLines  = leftText.value.split('\n')
  const rightLines = rightText.value.split('\n')
  const lNorm = leftLines.map(normalize)
  const rNorm = rightLines.map(normalize)

  // LCS DP 表
  const m = lNorm.length, n = rNorm.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = lNorm[i] === rNorm[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  // 回溯
  const result: DiffLine[] = []
  let i = 0, j = 0
  let lNum = 0, rNum = 0
  while (i < m && j < n) {
    if (lNorm[i] === rNorm[j]) {
      result.push({ type: 'equal', left: leftLines[i], right: rightLines[j], leftNum: ++lNum, rightNum: ++rNum })
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // left 有，right 没有 → removed
      // 检查是否是 modified（同行位置都有内容但不同）
      result.push({ type: 'removed', left: leftLines[i], leftNum: ++lNum })
      i++
    } else {
      result.push({ type: 'added', right: rightLines[j], rightNum: ++rNum })
      j++
    }
  }
  while (i < m) { result.push({ type: 'removed', left: leftLines[i], leftNum: ++lNum }); i++ }
  while (j < n) { result.push({ type: 'added', right: rightLines[j], rightNum: ++rNum }); j++ }

  // 合并连续的 removed + added 为 modified
  const merged: DiffLine[] = []
  for (let k = 0; k < result.length; k++) {
    if (result[k].type === 'removed') {
      // 查找后续连续的 added
      let remGroup: DiffLine[] = []
      while (k < result.length && result[k].type === 'removed') { remGroup.push(result[k]); k++ }
      let addGroup: DiffLine[] = []
      while (k < result.length && result[k].type === 'added') { addGroup.push(result[k]); k++ }
      // 如果两个组都只有1行，标为 modified
      if (remGroup.length === 1 && addGroup.length === 1) {
        merged.push({ type: 'modified', left: remGroup[0].left, right: addGroup[0].right, leftNum: remGroup[0].leftNum, rightNum: addGroup[0].rightNum })
      } else {
        merged.push(...remGroup, ...addGroup)
      }
      k-- // 回退一步，因为外层循环会 k++
    } else {
      merged.push(result[k])
    }
  }

  return merged
}

const diffResult = computed(() => {
  if (!leftText.value && !rightText.value) return []
  return computeDiff()
})

const stats = computed(() => {
  let added = 0, removed = 0, modified = 0, equal = 0
  for (const d of diffResult.value) {
    if (d.type === 'added') added++
    else if (d.type === 'removed') removed++
    else if (d.type === 'modified') modified++
    else equal++
  }
  return { added, removed, modified, equal, total: diffResult.value.length }
})

const copied = ref(false)
const copyResult = async () => {
  const text = diffResult.value.map(d => {
    const prefix = d.type === 'added' ? '+ ' : d.type === 'removed' ? '- ' : d.type === 'modified' ? '~ ' : '  '
    return prefix + (d.left || d.right || '')
  }).join('\n')
  await navigator.clipboard.writeText(text)
  copied.value = true; setTimeout(() => { copied.value = false }, 2000)
}

const swap = () => {
  const tmp = leftText.value
  leftText.value = rightText.value
  rightText.value = tmp
}

const loadExample = () => {
  leftText.value = `function greet(name) {
  console.log("Hello, " + name)
  return true
}

const arr = [1, 2, 3]
arr.forEach(item => {
  console.log(item)
})`
  rightText.value = `function greet(name) {
  console.log(\`Hello, \${name}\`)
  return true
}

const arr = [1, 2, 3, 4]
arr.forEach(item => {
  console.log(item * 2)
})`
}
</script>

<template>
  <div class="space-y-5">
    <!-- 选项栏 -->
    <div class="flex flex-wrap gap-4 items-center">
      <label class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400 cursor-pointer select-none">
        <input type="checkbox" v-model="ignoreWhitespace" class="w-3.5 h-3.5 accent-accent" /> 忽略空格
      </label>
      <label class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400 cursor-pointer select-none">
        <input type="checkbox" v-model="ignoreCase" class="w-3.5 h-3.5 accent-accent" /> 忽略大小写
      </label>
      <div class="ml-auto flex gap-2">
        <button @click="loadExample" class="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">载入示例</button>
        <button @click="swap" class="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent transition-all">⇄ 交换</button>
      </div>
    </div>

    <!-- 双栏输入 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-medium text-red-600 dark:text-red-400">原始文本（左）</span>
          <button @click="leftText = ''" v-if="leftText" class="text-xs text-gray-400 hover:text-red-500 transition-colors">清空</button>
        </div>
        <textarea v-model="leftText" rows="10" placeholder="粘贴原始文本..."
          class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none"
          spellcheck="false"></textarea>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-medium text-green-600 dark:text-green-400">修改后文本（右）</span>
          <button @click="rightText = ''" v-if="rightText" class="text-xs text-gray-400 hover:text-red-500 transition-colors">清空</button>
        </div>
        <textarea v-model="rightText" rows="10" placeholder="粘贴修改后文本..."
          class="w-full px-4 py-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 resize-none"
          spellcheck="false"></textarea>
      </div>
    </div>

    <!-- 统计 -->
    <div v-if="diffResult.length" class="flex flex-wrap items-center gap-3">
      <span class="text-xs text-gray-500 dark:text-slate-500">共 {{ stats.total }} 行</span>
      <span v-if="stats.equal" class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400">相同 {{ stats.equal }}</span>
      <span v-if="stats.added" class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">新增 +{{ stats.added }}</span>
      <span v-if="stats.removed" class="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">删除 -{{ stats.removed }}</span>
      <span v-if="stats.modified" class="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">修改 ~{{ stats.modified }}</span>
      <button @click="copyResult" :class="['ml-auto text-xs px-3 py-1 rounded-lg border transition-all', copied ? 'border-green-400 text-green-600 dark:text-green-400' : 'border-gray-200 dark:border-slate-700 text-gray-500 hover:border-accent/50']">
        {{ copied ? '已复制' : '复制 Diff' }}
      </button>
    </div>

    <!-- Diff 结果 -->
    <div v-if="diffResult.length" class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div class="px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
        <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">逐行对比</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm font-mono">
          <tbody>
            <tr v-for="(d, i) in diffResult" :key="i"
              :class="{
                'bg-green-50 dark:bg-green-900/20': d.type === 'added',
                'bg-red-50 dark:bg-red-900/20': d.type === 'removed',
                'bg-amber-50 dark:bg-amber-900/20': d.type === 'modified',
              }"
            >
              <!-- 行号 -->
              <td class="px-2 py-0.5 text-xs text-gray-400 dark:text-slate-600 w-10 text-right select-none border-r border-gray-100 dark:border-slate-800">
                {{ d.leftNum || '' }}
              </td>
              <td class="px-2 py-0.5 text-xs text-gray-400 dark:text-slate-600 w-10 text-right select-none border-r border-gray-100 dark:border-slate-800">
                {{ d.rightNum || '' }}
              </td>
              <!-- 标记 -->
              <td class="px-2 py-0.5 text-center w-8 select-none border-r border-gray-100 dark:border-slate-800"
                :class="{
                  'text-green-600 dark:text-green-400': d.type === 'added',
                  'text-red-600 dark:text-red-400': d.type === 'removed',
                  'text-amber-600 dark:text-amber-400': d.type === 'modified',
                  'text-gray-300 dark:text-slate-700': d.type === 'equal',
                }"
              >
                {{ d.type === 'added' ? '+' : d.type === 'removed' ? '-' : d.type === 'modified' ? '~' : ' ' }}
              </td>
              <!-- 内容 -->
              <td class="px-3 py-0.5 break-all"
                :class="{
                  'text-green-700 dark:text-green-300': d.type === 'added',
                  'text-red-700 dark:text-red-300 line-through': d.type === 'removed',
                  'text-gray-600 dark:text-slate-400': d.type === 'equal',
                }"
              >{{ d.left || d.right || ' ' }}</td>
              <!-- 修改后的新值 -->
              <td v-if="d.type === 'modified'" class="px-3 py-0.5 break-all text-green-700 dark:text-green-300 border-l border-amber-200 dark:border-amber-800">
                → {{ d.right }}
              </td>
              <td v-else class="border-l border-gray-50 dark:border-slate-800/50"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="py-8 text-center text-gray-300 dark:text-slate-700 text-sm">
      在左右两侧分别粘贴文本，自动逐行对比差异
    </div>
  </div>
</template>
