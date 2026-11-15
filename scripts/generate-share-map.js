/**
 * 构建脚本：生成 share-map.json
 * 为每个工具分配 token，用于加密分享链接
 * token 稳定策略：读取已有 share-map.json，已存在工具的 token 原样复用，
 * 只有新增工具才生成新 token，已分享的链接不会因重新构建而失效
 * 运行方式：node scripts/generate-share-map.js
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');

// ============ 配置 ============
const TOKEN_LENGTH = 8;
const TOKEN_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

// ============ 工具函数 ============

/** 生成随机 token */
function generateToken() {
  const bytes = randomBytes(TOKEN_LENGTH);
  let token = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += TOKEN_CHARS[bytes[i] % TOKEN_CHARS.length];
  }
  return token;
}

/** 确保 token 唯一 */
function generateUniqueToken(existing) {
  let token;
  do {
    token = generateToken();
  } while (existing.has(token));
  return token;
}

// ============ 主流程 ============

function main() {
  console.log('🔗 生成分享链接映射...');

  const usedTokens = new Set();
  const shareMap = {};

  // 0. 读取已有映射，建立 type:target → token 反查表（token 复用）
  const previousPath = join(root, 'src', 'data', 'share-map.json');
  const previousMap = existsSync(previousPath)
    ? JSON.parse(readFileSync(previousPath, 'utf-8'))
    : {};
  const tokenByTarget = new Map();
  for (const [token, entry] of Object.entries(previousMap)) {
    tokenByTarget.set(`${entry.type}:${entry.target}`, token);
  }

  /** 取已有 token 或生成新 token，并登记为已占用 */
  function resolveToken(type, slug) {
    const existing = tokenByTarget.get(`${type}:${slug}`);
    const token = existing && !usedTokens.has(existing)
      ? existing
      : generateUniqueToken(usedTokens);
    usedTokens.add(token);
    return token;
  }

  // 1. 扫描工具页面
  const toolsDir = join(root, 'src', 'pages', 'tools');
  if (existsSync(toolsDir)) {
    const toolFiles = readdirSync(toolsDir).filter(f => f.endsWith('.astro') && f !== 'index.astro');
    for (const file of toolFiles) {
      const slug = basename(file, '.astro');
      const token = resolveToken('tool', slug);
      shareMap[token] = {
        type: 'tool',
        target: slug,
        title: slug, // 构建时无法轻松获取中文名，运行时从 tools 数据匹配
      };
    }
    console.log(`  ✅ 扫描到 ${toolFiles.length} 个工具`);
  }

  // 2. 写入 share-map.json
  const outputDir = join(root, 'src', 'data');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = join(outputDir, 'share-map.json');
  writeFileSync(outputPath, JSON.stringify(shareMap, null, 2), 'utf-8');

  const totalEntries = Object.keys(shareMap).length;
  console.log(`\n🎉 生成完成！共 ${totalEntries} 个分享链接`);
  console.log(`📄 输出文件：src/data/share-map.json`);

  // 打印预览
  console.log('\n📋 分享链接预览：');
  for (const [token, entry] of Object.entries(shareMap)) {
    console.log(`  🔧 /s/${token} → /tools/${entry.target}`);
  }
}

try {
  main();
} catch (err) {
  console.error('❌ 生成分享映射失败:', err);
  process.exit(1);
}
