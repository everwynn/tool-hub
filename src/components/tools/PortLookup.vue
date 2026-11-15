<script setup lang="ts">
// ============================================================
// PortLookup — 常用端口号速查工具
// ============================================================

import { ref, computed } from 'vue'

interface Port {
  port: number | string
  protocol: 'TCP' | 'UDP' | 'TCP/UDP'
  service: string
  desc: string
  category: string
  danger?: boolean  // 是否建议不要暴露到公网
}

const allPorts: Port[] = [
  // 系统/网络
  { port: 20,    protocol: 'TCP', service: 'FTP Data',      category: '系统', desc: 'FTP 数据传输端口' },
  { port: 21,    protocol: 'TCP', service: 'FTP Control',   category: '系统', desc: 'FTP 控制端口，建议改用 SFTP 替代', danger: true },
  { port: 22,    protocol: 'TCP', service: 'SSH',           category: '系统', desc: '安全远程登录，建议修改默认端口并禁用密码登录' },
  { port: 23,    protocol: 'TCP', service: 'Telnet',        category: '系统', desc: '明文远程登录，已废弃，切勿暴露到公网', danger: true },
  { port: 25,    protocol: 'TCP', service: 'SMTP',          category: '邮件', desc: '邮件发送协议，云服务器通常默认封禁', danger: true },
  { port: 53,    protocol: 'TCP/UDP', service: 'DNS',       category: '系统', desc: 'DNS 域名解析服务' },
  { port: 67,    protocol: 'UDP', service: 'DHCP Server',   category: '系统', desc: 'DHCP 服务端，自动分配 IP 地址' },
  { port: 80,    protocol: 'TCP', service: 'HTTP',          category: 'Web', desc: 'HTTP 明文 Web 服务，建议强制跳转 HTTPS' },
  { port: 110,   protocol: 'TCP', service: 'POP3',          category: '邮件', desc: '邮件接收协议（旧版）' },
  { port: 143,   protocol: 'TCP', service: 'IMAP',          category: '邮件', desc: '邮件接收协议（现代）' },
  { port: 443,   protocol: 'TCP', service: 'HTTPS',         category: 'Web', desc: 'HTTPS 加密 Web 服务，标准生产端口' },
  { port: 465,   protocol: 'TCP', service: 'SMTPS',         category: '邮件', desc: 'SMTP over SSL，加密邮件发送' },
  { port: 587,   protocol: 'TCP', service: 'SMTP Submission', category: '邮件', desc: '邮件提交端口（推荐用于发信）' },
  { port: 993,   protocol: 'TCP', service: 'IMAPS',         category: '邮件', desc: 'IMAP over SSL' },
  // 数据库
  { port: 1433,  protocol: 'TCP', service: 'SQL Server',    category: '数据库', desc: 'Microsoft SQL Server，避免暴露公网', danger: true },
  { port: 1521,  protocol: 'TCP', service: 'Oracle DB',     category: '数据库', desc: 'Oracle 数据库，避免暴露公网', danger: true },
  { port: 3306,  protocol: 'TCP', service: 'MySQL',         category: '数据库', desc: 'MySQL / MariaDB，只允许内网访问', danger: true },
  { port: 5432,  protocol: 'TCP', service: 'PostgreSQL',    category: '数据库', desc: 'PostgreSQL 数据库，只允许内网访问', danger: true },
  { port: 5672,  protocol: 'TCP', service: 'RabbitMQ',      category: '消息队列', desc: 'RabbitMQ AMQP 协议端口' },
  { port: 6379,  protocol: 'TCP', service: 'Redis',         category: '数据库', desc: 'Redis 缓存/消息，默认无密码，切勿暴露公网', danger: true },
  { port: 9200,  protocol: 'TCP', service: 'Elasticsearch', category: '数据库', desc: 'Elasticsearch HTTP API，避免暴露公网', danger: true },
  { port: 9300,  protocol: 'TCP', service: 'Elasticsearch', category: '数据库', desc: 'Elasticsearch 节点通信端口' },
  { port: 27017, protocol: 'TCP', service: 'MongoDB',       category: '数据库', desc: 'MongoDB 数据库，默认无认证，避免暴露公网', danger: true },
  // 应用
  { port: 2181,  protocol: 'TCP', service: 'Zookeeper',     category: '中间件', desc: 'Apache Zookeeper 客户端端口' },
  { port: 2375,  protocol: 'TCP', service: 'Docker API',    category: '运维', desc: 'Docker 远程 API（HTTP），切勿暴露公网', danger: true },
  { port: 2376,  protocol: 'TCP', service: 'Docker API TLS',category: '运维', desc: 'Docker 远程 API（HTTPS/TLS）' },
  { port: 3000,  protocol: 'TCP', service: 'Node.js/Grafana', category: '应用', desc: '常用于 Node.js 开发服务器、Grafana 面板' },
  { port: 4200,  protocol: 'TCP', service: 'Angular Dev',   category: '应用', desc: 'Angular CLI 开发服务器默认端口' },
  { port: 5000,  protocol: 'TCP', service: 'Flask/Docker Registry', category: '应用', desc: 'Python Flask 开发服务器 / Docker Registry' },
  { port: 6443,  protocol: 'TCP', service: 'Kubernetes API', category: '运维', desc: 'Kubernetes API Server 端口' },
  { port: 8080,  protocol: 'TCP', service: 'HTTP Alternative', category: 'Web', desc: '常用备用 HTTP 端口（Tomcat/开发环境）' },
  { port: 8443,  protocol: 'TCP', service: 'HTTPS Alternative', category: 'Web', desc: '常用备用 HTTPS 端口' },
  { port: 8888,  protocol: 'TCP', service: 'Jupyter',       category: '应用', desc: 'Jupyter Notebook 默认端口' },
  { port: 9090,  protocol: 'TCP', service: 'Prometheus',    category: '运维', desc: 'Prometheus 监控系统 Web UI' },
  { port: 9092,  protocol: 'TCP', service: 'Kafka',         category: '消息队列', desc: 'Apache Kafka Broker 端口' },
  { port: 15672, protocol: 'TCP', service: 'RabbitMQ UI',   category: '消息队列', desc: 'RabbitMQ 管理界面，避免暴露公网', danger: true },
]

const categories = ['全部', '系统', 'Web', '数据库', '应用', '运维', '邮件', '消息队列', '中间件']
const activeCategory = ref('全部')
const searchQuery = ref('')

const filtered = computed(() => {
  let list = allPorts
  if (activeCategory.value !== '全部') {
    list = list.filter(p => p.category === activeCategory.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(p =>
      String(p.port).includes(q) ||
      p.service.toLowerCase().includes(q) ||
      p.desc.includes(q) ||
      p.category.includes(q)
    )
  }
  return list
})

const protocolColor: Record<string, string> = {
  TCP: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300',
  UDP: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300',
  'TCP/UDP': 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300',
}
</script>

<template>
  <div class="space-y-5">
    <!-- 搜索 + 分类 -->
    <div class="flex flex-col sm:flex-row gap-3">
      <div class="relative max-w-xs flex-1">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input v-model="searchQuery" type="text" placeholder="输入端口号或服务名..." class="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"/>
      </div>
      <div class="flex flex-wrap gap-2">
        <button v-for="cat in categories" :key="cat" @click="activeCategory = cat"
          :class="['px-3 py-1.5 text-xs font-medium rounded-lg border transition-all', activeCategory === cat ? 'bg-accent text-white border-accent' : 'bg-white dark:bg-slate-900/50 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-accent/40']"
        >{{ cat }}</button>
      </div>
    </div>

    <div class="text-xs text-gray-400 dark:text-slate-600">共 {{ filtered.length }} 个端口</div>

    <!-- 表格 -->
    <div class="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-700">
          <tr>
            <th class="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-slate-500 w-20">端口</th>
            <th class="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-slate-500 w-20">协议</th>
            <th class="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-slate-500 w-36">服务</th>
            <th class="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-slate-500">说明</th>
            <th class="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-slate-500 w-20">分类</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filtered" :key="String(item.port)"
            :class="['border-t border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors', item.danger ? 'bg-red-50/30 dark:bg-red-900/5' : '']"
          >
            <td class="px-4 py-2.5">
              <span class="font-mono font-bold text-gray-900 dark:text-white">{{ item.port }}</span>
            </td>
            <td class="px-4 py-2.5">
              <span :class="['text-xs px-2 py-0.5 rounded font-mono', protocolColor[item.protocol]]">{{ item.protocol }}</span>
            </td>
            <td class="px-4 py-2.5 font-medium text-gray-700 dark:text-slate-300">
              <div class="flex items-center gap-1.5">
                {{ item.service }}
                <span v-if="item.danger" title="建议不要暴露到公网" class="text-red-400 text-xs">⚠</span>
              </div>
            </td>
            <td class="px-4 py-2.5 text-gray-500 dark:text-slate-400 text-xs leading-relaxed">{{ item.desc }}</td>
            <td class="px-4 py-2.5">
              <span class="text-xs text-gray-400 dark:text-slate-600">{{ item.category }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="filtered.length === 0" class="py-12 text-center text-gray-400 dark:text-slate-600 text-sm">未找到匹配端口</div>
    </div>

    <!-- 图例 -->
    <div class="flex items-center gap-4 text-xs text-gray-400 dark:text-slate-600">
      <span>⚠ 标记 = 建议不要直接暴露到公网，需配置防火墙或通过跳板机访问</span>
    </div>
  </div>
</template>
