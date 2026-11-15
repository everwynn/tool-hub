<script setup lang="ts">
// ============================================================
// ChmodCalculator — Linux 文件权限计算器
// ============================================================

import { ref, computed } from 'vue'

type Entity = 'owner' | 'group' | 'other'
type Perm = 'r' | 'w' | 'x'

const perms = ref<Record<Entity, Record<Perm, boolean>>>({
  owner: { r: true,  w: true,  x: true  },
  group: { r: true,  w: false, x: true  },
  other: { r: true,  w: false, x: false },
})

const labels: Record<Entity, string> = { owner: '所有者 (u)', group: '所属组 (g)', other: '其他人 (o)' }
const entities: Entity[] = ['owner', 'group', 'other']
const permKeys: Perm[] = ['r', 'w', 'x']
const permLabels: Record<Perm, string> = { r: '读 (r)', w: '写 (w)', x: '执行 (x)' }
const permValues: Record<Perm, number> = { r: 4, w: 2, x: 1 }

const entityOctal = (e: Entity) =>
  permKeys.reduce((sum, p) => sum + (perms.value[e][p] ? permValues[p] : 0), 0)

const octalStr = computed(() =>
  entities.map(e => entityOctal(e)).join('')
)

const symbolicStr = computed(() => {
  return entities.map(e =>
    permKeys.map(p => perms.value[e][p] ? p : '-').join('')
  ).join('')
})

const chmodCmd = computed(() => `chmod ${octalStr.value} filename`)
const chmodSymCmd = computed(() => {
  const parts: string[] = []
  const codes: Record<Entity, string> = { owner: 'u', group: 'g', other: 'o' }
  for (const e of entities) {
    const on = permKeys.filter(p => perms.value[e][p]).join('')
    const off = permKeys.filter(p => !perms.value[e][p]).join('')
    if (on) parts.push(`${codes[e]}+${on}`)
    if (off) parts.push(`${codes[e]}-${off}`)
  }
  return `chmod ${parts.join(',')} filename`
})

// 常用预设
const presets = [
  { label: '755',  desc: '可执行文件（rwxr-xr-x）', val: { owner: { r:true,w:true,x:true }, group: { r:true,w:false,x:true }, other: { r:true,w:false,x:true } } },
  { label: '644',  desc: '普通文件（rw-r--r--）',   val: { owner: { r:true,w:true,x:false }, group: { r:true,w:false,x:false }, other: { r:true,w:false,x:false } } },
  { label: '600',  desc: '私钥文件（rw-------）',   val: { owner: { r:true,w:true,x:false }, group: { r:false,w:false,x:false }, other: { r:false,w:false,x:false } } },
  { label: '777',  desc: '完全开放（rwxrwxrwx）⚠',  val: { owner: { r:true,w:true,x:true }, group: { r:true,w:true,x:true }, other: { r:true,w:true,x:true } } },
  { label: '700',  desc: '私有目录（rwx------）',   val: { owner: { r:true,w:true,x:true }, group: { r:false,w:false,x:false }, other: { r:false,w:false,x:false } } },
  { label: '664',  desc: '协作文件（rw-rw-r--）',   val: { owner: { r:true,w:true,x:false }, group: { r:true,w:true,x:false }, other: { r:true,w:false,x:false } } },
  { label: '400',  desc: '只读文件（r--------）',   val: { owner: { r:true,w:false,x:false }, group: { r:false,w:false,x:false }, other: { r:false,w:false,x:false } } },
  { label: '750',  desc: '组可执行（rwxr-x---）',   val: { owner: { r:true,w:true,x:true }, group: { r:true,w:false,x:true }, other: { r:false,w:false,x:false } } },
]

const applyPreset = (preset: typeof presets[0]) => {
  perms.value = JSON.parse(JSON.stringify(preset.val))
}

// 从八进制输入反推
const octalInput = ref('')
const applyOctal = () => {
  const str = octalInput.value.trim()
  if (!/^[0-7]{3}$/.test(str)) return
  const [o, g, ot] = str.split('').map(Number)
  const decode = (n: number): Record<Perm, boolean> => ({
    r: (n & 4) !== 0,
    w: (n & 2) !== 0,
    x: (n & 1) !== 0,
  })
  perms.value = { owner: decode(o), group: decode(g), other: decode(ot) }
}

const copied = ref('')
const copy = async (text: string, key: string) => {
  await navigator.clipboard.writeText(text)
  copied.value = key
  setTimeout(() => { copied.value = '' }, 1800)
}

// 权限含义说明
const meaning = computed(() => {
  const oct = octalStr.value
  const tips: string[] = []
  if (oct === '777') tips.push('⚠ 不推荐：777 权限过于开放，存在安全风险')
  if (perms.value.other.w) tips.push('⚠ 其他用户可写，生产环境需谨慎')
  if (perms.value.owner.x || perms.value.group.x || perms.value.other.x) tips.push('✓ 包含可执行权限，适用于脚本/程序文件')
  if (!perms.value.owner.x && !perms.value.group.x && !perms.value.other.x) tips.push('✓ 无执行权限，适用于普通文档/配置文件')
  return tips
})
</script>

<template>
  <div class="space-y-6">
    <!-- 快速输入八进制 -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600 dark:text-slate-400">输入八进制：</span>
        <input
          v-model="octalInput"
          @input="applyOctal"
          type="text"
          placeholder="755"
          maxlength="3"
          class="w-20 px-3 py-2 text-center text-lg font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
        />
      </div>
      <span class="text-xs text-gray-400 dark:text-slate-600">或使用下方面板勾选权限</span>
    </div>

    <!-- 权限勾选面板 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-700">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-500">对象</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-green-600 dark:text-green-400">读 (r=4)</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-amber-600 dark:text-amber-400">写 (w=2)</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-blue-600 dark:text-blue-400">执行 (x=1)</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-500">数值</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-500">符号</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entities" :key="e" class="border-t border-gray-100 dark:border-slate-800">
            <td class="px-4 py-3 text-sm font-medium text-gray-700 dark:text-slate-300">{{ labels[e] }}</td>
            <td v-for="p in permKeys" :key="p" class="px-4 py-3 text-center">
              <label class="inline-flex items-center justify-center cursor-pointer">
                <input type="checkbox" v-model="perms[e][p]" class="sr-only" />
                <div :class="[
                  'w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all text-sm font-bold',
                  perms[e][p]
                    ? p === 'r' ? 'bg-green-500 border-green-500 text-white' : p === 'w' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-blue-500 border-blue-500 text-white'
                    : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-transparent'
                ]">{{ p }}</div>
              </label>
            </td>
            <td class="px-4 py-3 text-center font-mono font-bold text-xl text-accent-dark dark:text-accent">{{ entityOctal(e) }}</td>
            <td class="px-4 py-3 text-center font-mono text-sm text-gray-700 dark:text-slate-300">{{ permKeys.map(p => perms[e][p] ? p : '-').join('') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 结果展示 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div v-for="item in [
        { key: 'octal',  label: '八进制权限',  val: octalStr,    icon: '🔢' },
        { key: 'sym',    label: '符号表示',    val: symbolicStr, icon: '🔤' },
        { key: 'cmd1',   label: 'chmod 命令（数字）', val: chmodCmd, icon: '💻' },
        { key: 'cmd2',   label: 'chmod 命令（符号）', val: chmodSymCmd, icon: '💻' },
      ]" :key="item.key"
        class="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700"
      >
        <div>
          <div class="text-xs text-gray-400 dark:text-slate-600 mb-0.5">{{ item.icon }} {{ item.label }}</div>
          <code class="text-sm font-mono text-gray-900 dark:text-white font-semibold">{{ item.val }}</code>
        </div>
        <button @click="copy(item.val, item.key)" :class="['text-xs px-2.5 py-1 rounded-lg border transition-all flex-shrink-0', copied === item.key ? 'border-green-400 text-green-500' : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-accent/50 hover:text-accent-dark dark:hover:text-accent']">
          {{ copied === item.key ? '✓' : '复制' }}
        </button>
      </div>
    </div>

    <!-- 权限说明 -->
    <div v-if="meaning.length" class="space-y-1.5">
      <div v-for="(tip, i) in meaning" :key="i" :class="['text-xs px-3 py-2 rounded-lg', tip.startsWith('⚠') ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400']">
        {{ tip }}
      </div>
    </div>

    <!-- 常用预设 -->
    <div>
      <h3 class="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-3">常用预设</h3>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button v-for="p in presets" :key="p.label"
          @click="applyPreset(p); octalInput = p.label"
          :class="['text-left px-3 py-2.5 rounded-xl border transition-all', octalStr === p.label ? 'border-accent/50 bg-accent/5' : 'border-gray-200 dark:border-slate-700 hover:border-accent/40 bg-white dark:bg-slate-900/40']"
        >
          <div class="font-mono font-bold text-base text-accent-dark dark:text-accent">{{ p.label }}</div>
          <div class="text-xs text-gray-500 dark:text-slate-500 mt-0.5 leading-tight">{{ p.desc }}</div>
        </button>
      </div>
    </div>
  </div>
</template>
