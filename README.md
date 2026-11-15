# ToolHub

在线开发工具箱，纯前端、零后端、数据不上传。

ToolHub 提供日常开发中高频使用的纯前端工具，原为 TechHub 站的 `/tools` 模块，2026-11 拆分独立为独立站点。

- 在线地址：https://everwynn.github.io/tool-hub/（GitHub Pages 子路径部署）

## 工具列表（37 个 · 7 大分类）

- **编码转换**：Base64 编解码、URL 编解码、进制转换、命名风格转换
- **文本格式**：JSON 格式化、YAML ↔ JSON、Markdown 预览、文本 Diff、JSONPath 查询、CSV ↔ JSON、SQL 格式化、环境变量格式转换
- **时间随机**：Unix 时间戳、UUID、二维码、随机密码
- **图片工具**：AI 去水印（实验性）、图片压缩/格式转换、图片加水印、Favicon 生成、图片裁剪旋转
- **安全加密**：JWT 解码、JWT 生成、AES 加解密、哈希计算
- **运维部署**：Nginx 配置生成、Cron 解析、Docker Run 转 Compose、端口速查、chmod 权限计算、IP/CIDR 计算、cURL 转代码
- **开发辅助**：正则测试、HTTP 状态码、颜色格式转换、CSS 生成、JSON 转 TypeScript

分类与工具的映射维护在 `src/data/tools.ts`（`tools` 数组 + `categoryMeta`），首页分组、筛选、详情页徽章都由它驱动。

所有工具均运行在浏览器端（Web Crypto / Canvas / WebAssembly），无需后端服务，数据不会上传服务器。

## 页面结构

| 路径 | 说明 |
|---|---|
| `/` | 工具箱首页：居中搜索框 + 常用工具快捷行 + 7 大分类总览（锚点 `#tool-catalog`）+ 按分类分组的全量列表，无分页 |
| `/tools/{slug}/` | 单个工具页，底部 `PageShareBar` 提供返回目录与分享入口 |
| `/tools/` | 原「全部工具」列表页已下线，仅保留跳转页兼容老链接，自动跳转首页 `#tool-catalog` |

首页快捷键：`/` 或 `Ctrl/⌘ + K` 聚焦搜索；点击分类卡即筛选并定位到分组列表。

## 页面分享

- 公开分享：`/s/{token}` 短链，iframe 加载工具页（`?mode=share` 隐藏导航）
- 加密分享：AES-256-GCM + PBKDF2 加密目标路径，密文放入 `/share#v=1&d=...`

share-map 由 `scripts/generate-share-map.js` 在 prebuild 阶段生成，**已有 token 稳定复用**（重新构建不会使已分享链接失效）。

## 技术栈

- [Astro](https://astro.build/) 4 — 静态站点生成器
- [Vue](https://vuejs.org/) 3 — 交互式组件
- [Tailwind CSS](https://tailwindcss.com/) 3 — 样式框架
- [TypeScript](https://www.typescriptlang.org/) — 类型安全
- [onnxruntime-web](https://onnxruntime.ai/) — 浏览器端 AI 推理（AI 去水印）
- [qrcode](https://github.com/soldair/node-qrcode) — 二维码生成

## 项目结构

```text
/
├── .github/workflows/
│   └── deploy.yml       # GitHub Pages 自动部署
├── public/              # 静态资源（favicon；public/models/*.onnx 不入库）
├── scripts/
│   └── generate-share-map.js  # 生成分享 token 映射（prebuild）
├── src/
│   ├── components/
│   │   ├── tools/       # HomeCatalog + 37 个工具组件
│   │   └── ...          # Header/Footer/VisitCounter/分享组件
│   ├── data/
│   │   ├── tools.ts     # 工具数据源（37 工具 + 7 分类 + 常用排序）
│   │   └── share-map.json     # 分享 token 映射（自动生成）
│   ├── integrations/
│   │   └── fixBaseLinks.mjs   # 构建后为静态链接补 /tool-hub/ 前缀
│   ├── pages/
│   │   ├── index.astro  # 工具箱首页（搜索 / 分类总览 / 分组全量展示）
│   │   ├── tools/       # 37 个工具页 + 列表页跳转（老链接兼容）
│   │   ├── s/           # 公开分享短链
│   │   └── share.astro  # 加密分享页
│   └── layouts/ styles/
├── astro.config.mjs
├── package.json
├── tailwind.config.mjs
└── tsconfig.json
```

## AI 去水印模型

LaMa ONNX 模型（约 198MB）**不入库**。工具首次使用时会：

1. 尝试加载 `public/models/lama_fp32.onnx`（本地存在时）
2. 否则从 hf-mirror.com 镜像下载（浏览器缓存，后续无需重复下载）

模型来源与放置方法见 `public/models/README.md`。

## 本地开发

```sh
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产站点
npm run build

# 本地预览构建结果
npm run preview
```

开发服务器默认运行在 http://localhost:4321。

## 部署

部署目标为 GitHub Pages（项目子路径），对应仓库 `everwynn/tool-hub`：

- 构建产物 `./dist` 由 `.github/workflows/deploy.yml` 在 push main 后自动发布（需在仓库 Settings → Pages → Source 选择「GitHub Actions」）
- 子路径配置：`astro.config.mjs` 中 `site: 'https://everwynn.github.io/'`、`base: '/tool-hub/'`、`trailingSlash: 'always'`
- `fixBaseLinks` 集成在构建后为静态链接自动追加 `/tool-hub/` 前缀；Vue 组件内的动态路径统一用 `import.meta.env.BASE_URL` 拼接

> 若更换仓库名或绑定自定义域名，需同步修改 `base` 与 `fixBaseLinks('/tool-hub/')` 参数。

## 访问统计

页脚访问量由独立的 Cloudflare Worker（visit-stats，`https://stats.everwynn.me`）统计：

- `VisitCounter.astro` 仅在生产域名 `everwynn.github.io` 上报（本地/预览不计数），尊重 DoNotTrack 与全局隐私控制（GPC）
- site 标识为 `tool-hub`，需在 visit-stats 仓库 `src/lib/normalize.js` 的 `SITE_IDS` 白名单中注册后才会计数
- 统计按天聚合 PV/UV：路径自动去掉 `/tool-hub` 前缀，保留 35 天明细，聚合表长期保留

## 工具维护

1. 在 `src/components/tools/` 新建 Vue 工具组件
2. 在 `src/pages/tools/` 新建对应 Astro 页面（含 `PageShareBar`，提供返回目录与分享）
3. 在 `src/data/tools.ts` 注册工具数据（名称/图标/分类/描述/标签），分类取值见 `categoryMeta`（7 类）
4. 需要出现在首页「常用」行时，在工具上加 `popular: true`，并在 `POPULAR_ORDER` 中排定展示顺序
5. 重新构建，share-map 会为新工具自动分配 token（已有工具 token 不变）
