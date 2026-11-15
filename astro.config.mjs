// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import tailwind from '@astrojs/tailwind';
import fixBaseLinks from './src/integrations/fixBaseLinks.mjs';
import dropOrtWasm from './src/integrations/dropOrtWasm.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://everwynn.github.io/', // GitHub Pages 用户域名
  base: '/tool-hub/', // 仓库名（GitHub Pages 子路径）
  trailingSlash: 'always', // 处理 GitHub Pages 子路径路由 404

  integrations: [
    vue(),
    tailwind(),
    fixBaseLinks('/tool-hub/'), // 自动追加 base 前缀到内部链接
    dropOrtWasm(), // 清理打包冗余的 onnxruntime wasm（运行时走 CDN）
  ],

  output: 'static',

  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
