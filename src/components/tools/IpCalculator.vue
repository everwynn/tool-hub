<script setup lang="ts">
// ============================================================
// IpCalculator — IP/CIDR 子网计算器
// ============================================================

import { ref, watch } from 'vue'

const input = ref('192.168.1.100/24')
const copied = ref<string>('')

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    throw new Error('IP 地址格式错误')
  }
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]
}

function intToIp(int: number): string {
  return [
    (int >>> 24) & 0xFF,
    (int >>> 16) & 0xFF,
    (int >>> 8) & 0xFF,
    int & 0xFF,
  ].join('.')
}

function toBinary(int: number): string {
  return int.toString(2).padStart(32, '0')
}

function formatBinary(b: string): string {
  return b.match(/.{8}/g)!.join('.')
}

interface IpResult {
  ip: string
  prefix: number
  mask: string
  network: string
  broadcast: string
  hostMin: string
  hostMax: string
  totalHosts: number
  usableHosts: number
  ipBinary: string
  maskBinary: string
  networkBinary: string
  wildcard: string
  isPrivate: boolean
  ipClass: string
}

const errorMsg = ref('')
const result = ref<IpResult | null>(null)

function compute() {
  const raw = input.value.trim()
  errorMsg.value = ''
  result.value = null
  if (!raw) return

  try {
    let ip: string
    let prefix: number
    if (raw.includes('/')) {
      const parts = raw.split('/')
      ip = parts[0]
      prefix = parseInt(parts[1])
    } else {
      ip = raw
      const first = parseInt(ip.split('.')[0])
      if (first <= 127) prefix = 8
      else if (first <= 191) prefix = 16
      else if (first <= 223) prefix = 24
      else throw new Error('无法自动推断前缀，请使用 CIDR 格式如 192.168.1.0/24')
    }

    const ipInt = ipToInt(ip)
    if (prefix < 0 || prefix > 32) throw new Error('前缀必须在 0-32 之间')

    const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0
    const network = (ipInt & mask) >>> 0
    const broadcast = (network | (~mask >>> 0)) >>> 0
    const hostMin = network + 1
    const hostMax = broadcast - 1
    const totalHosts = prefix >= 31 ? (2 ** (32 - prefix)) : (2 ** (32 - prefix))
    const usableHosts = prefix >= 31 ? totalHosts : (totalHosts - 2)

    const isPrivate =
      (firstOctet(ip) === 10) ||
      (firstOctet(ip) === 172 && secondOctet(ip) >= 16 && secondOctet(ip) <= 31) ||
      (firstOctet(ip) === 192 && secondOctet(ip) === 168)

    result.value = {
      ip,
      prefix,
      mask: intToIp(mask),
      network: intToIp(network),
      broadcast: intToIp(broadcast),
      hostMin: intToIp(hostMin),
      hostMax: intToIp(hostMax),
      totalHosts,
      usableHosts,
      ipBinary: formatBinary(toBinary(ipInt)),
      maskBinary: formatBinary(toBinary(mask)),
      networkBinary: formatBinary(toBinary(network)),
      wildcard: intToIp(~mask >>> 0),
      isPrivate,
      ipClass: getIpClass(firstOctet(ip)),
    }
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
  }
}

watch(input, compute, { immediate: true })

function firstOctet(ip: string): number { return parseInt(ip.split('.')[0]) }
function secondOctet(ip: string): number { return parseInt(ip.split('.')[1]) }
function getIpClass(first: number): string {
  if (first <= 127) return 'A'
  if (first <= 191) return 'B'
  if (first <= 223) return 'C'
  if (first <= 239) return 'D（组播）'
  if (first <= 255) return 'E（保留）'
  return '未知'
}

const copy = async (text: string, key: string) => {
  await navigator.clipboard.writeText(text)
  copied.value = key; setTimeout(() => { copied.value = '' }, 2000)
}

// 常见子网速查
const commonSubnets = [
  { cidr: '/30', hosts: '2', use: '点对点链路' },
  { cidr: '/29', hosts: '6', use: '小型子网' },
  { cidr: '/28', hosts: '14', use: '小型部门' },
  { cidr: '/27', hosts: '30', use: '中型部门' },
  { cidr: '/26', hosts: '62', use: '大型部门' },
  { cidr: '/24', hosts: '254', use: '标准 C 类子网' },
  { cidr: '/23', hosts: '510', use: '中型局域网' },
  { cidr: '/22', hosts: '1022', use: '大型局域网' },
  { cidr: '/16', hosts: '65534', use: '标准 B 类' },
  { cidr: '/8',  hosts: '16777214', use: '标准 A 类' },
]
</script>

<template>
  <div class="space-y-5">
    <!-- 输入 -->
    <div>
      <label class="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">IP 地址 / CIDR</label>
      <input v-model="input" type="text" spellcheck="false" placeholder="192.168.1.100/24"
        class="w-full px-4 py-3 text-base font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
      />
      <div class="mt-1 text-xs text-gray-400 dark:text-slate-600">支持 CIDR 格式（如 10.0.0.0/8）或纯 IP（自动推断 A/B/C 类前缀）</div>
    </div>

    <!-- 错误 -->
    <div v-if="errorMsg" class="text-xs text-red-500 dark:text-red-400 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
      {{ errorMsg }}
    </div>

    <!-- 结果 -->
    <div v-if="result" class="space-y-4">
      <!-- 关键信息卡片 -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div v-for="item in [
          { label: '网络地址', value: result.network, key: 'network', color: 'text-blue-600 dark:text-blue-400' },
          { label: '广播地址', value: result.broadcast, key: 'broadcast', color: 'text-red-600 dark:text-red-400' },
          { label: '子网掩码', value: result.mask, key: 'mask', color: 'text-emerald-600 dark:text-emerald-400' },
          { label: '通配符掩码', value: result.wildcard, key: 'wildcard', color: 'text-purple-600 dark:text-purple-400' },
          { label: '首个可用主机', value: result.hostMin, key: 'hostMin', color: 'text-amber-600 dark:text-amber-400' },
          { label: '最后可用主机', value: result.hostMax, key: 'hostMax', color: 'text-amber-600 dark:text-amber-400' },
        ]" :key="item.key"
          class="px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40"
        >
          <div class="text-xs text-gray-400 dark:text-slate-600 mb-1">{{ item.label }}</div>
          <div class="flex items-center justify-between gap-2">
            <code :class="['text-sm font-mono font-semibold', item.color]">{{ item.value }}</code>
            <button @click="copy(item.value, item.key)" class="text-xs text-gray-300 hover:text-accent-dark dark:hover:text-accent transition-colors flex-shrink-0">
              {{ copied === item.key ? '✓' : '📋' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 主机数 -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="px-4 py-3 rounded-xl bg-accent/5 border border-accent/15 text-center">
          <div class="text-xs text-gray-500 dark:text-slate-500 mb-1">可用主机数</div>
          <div class="text-xl font-bold text-accent-dark dark:text-accent">{{ result.usableHosts.toLocaleString() }}</div>
        </div>
        <div class="px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900/40 border border-gray-200 dark:border-slate-700 text-center">
          <div class="text-xs text-gray-500 dark:text-slate-500 mb-1">总地址数</div>
          <div class="text-xl font-bold text-gray-700 dark:text-slate-300">{{ result.totalHosts.toLocaleString() }}</div>
        </div>
        <div class="px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900/40 border border-gray-200 dark:border-slate-700 text-center">
          <div class="text-xs text-gray-500 dark:text-slate-500 mb-1">IP 类别</div>
          <div class="text-xl font-bold text-gray-700 dark:text-slate-300">{{ result.ipClass }}</div>
        </div>
        <div class="px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900/40 border border-gray-200 dark:border-slate-700 text-center">
          <div class="text-xs text-gray-500 dark:text-slate-500 mb-1">私有地址</div>
          <div class="text-xl font-bold" :class="result.isPrivate ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-slate-600'">{{ result.isPrivate ? '是' : '否' }}</div>
        </div>
      </div>

      <!-- 二进制表示 -->
      <div class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div class="px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
          <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">二进制表示</span>
        </div>
        <div class="p-4 space-y-2 font-mono text-xs">
          <div class="flex gap-3 items-center">
            <span class="text-gray-400 dark:text-slate-600 w-20 flex-shrink-0">IP 地址</span>
            <span class="text-gray-700 dark:text-slate-300 break-all">{{ result.ipBinary }}</span>
          </div>
          <div class="flex gap-3 items-center">
            <span class="text-gray-400 dark:text-slate-600 w-20 flex-shrink-0">子网掩码</span>
            <span class="text-emerald-600 dark:text-emerald-400 break-all">{{ result.maskBinary }}</span>
          </div>
          <div class="flex gap-3 items-center">
            <span class="text-gray-400 dark:text-slate-600 w-20 flex-shrink-0">网络地址</span>
            <span class="text-blue-600 dark:text-blue-400 break-all">{{ result.networkBinary }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 常见子网速查 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div class="px-4 py-2.5 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
        <span class="text-xs font-semibold text-gray-600 dark:text-slate-300">常见 CIDR 子网速查</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs font-mono">
          <thead>
            <tr class="border-b border-gray-100 dark:border-slate-800">
              <th class="px-4 py-2 text-left text-gray-500 dark:text-slate-500">CIDR</th>
              <th class="px-4 py-2 text-left text-gray-500 dark:text-slate-500">可用主机数</th>
              <th class="px-4 py-2 text-left text-gray-500 dark:text-slate-500">典型用途</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in commonSubnets" :key="s.cidr"
              :class="['border-b border-gray-50 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/30 cursor-pointer', result?.prefix === parseInt(s.cidr.slice(1)) ? 'bg-accent/5' : '']"
              @click="input = '192.168.1.1' + s.cidr"
            >
              <td class="px-4 py-1.5 text-accent-dark dark:text-accent font-semibold">{{ s.cidr }}</td>
              <td class="px-4 py-1.5 text-gray-700 dark:text-slate-300">{{ Number(s.hosts).toLocaleString() }}</td>
              <td class="px-4 py-1.5 text-gray-500 dark:text-slate-500">{{ s.use }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
