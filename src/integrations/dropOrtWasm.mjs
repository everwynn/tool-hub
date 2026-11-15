import fs from 'fs';
import path from 'path';

/**
 * Astro 构建完成后，删除 Vite 打包产物中的 onnxruntime-web wasm（约 28MB）
 *
 * 背景：组件源码 import onnxruntime-web 后，Vite 会对库内部的
 * new URL('ort-wasm-*.jsep.wasm', import.meta.url) 做静态分析并把 wasm
 * 复制进 dist/_astro/；而运行时 wasm 统一从 jsdelivr CDN 加载
 * （WatermarkRemover.vue 中 wasmPaths 配置 + 单线程、关闭 proxy），
 * 该文件不会被请求，属于纯冗余产物。
 */
export default function dropOrtWasm() {
    return {
        name: 'drop-ort-wasm',
        hooks: {
            'astro:build:done': async ({ dir }) => {
                let distDir = dir.pathname;
                // Windows下 pathname 形如 /E:/...，需去掉开头 /
                if (process.platform === 'win32' && distDir.startsWith('/')) {
                    distDir = distDir.slice(1);
                }
                const astroDir = path.join(distDir, '_astro');
                if (!fs.existsSync(astroDir)) return;

                let removed = 0;
                let bytes = 0;
                for (const name of fs.readdirSync(astroDir)) {
                    if (/^ort-wasm-.*\.wasm$/.test(name)) {
                        const filePath = path.join(astroDir, name);
                        bytes += fs.statSync(filePath).size;
                        fs.unlinkSync(filePath);
                        removed += 1;
                    }
                }
                if (removed > 0) {
                    const mb = (bytes / 1024 / 1024).toFixed(1);
                    console.log(`✅已清理：onnxruntime 打包 wasm ${removed} 个（${mb} MB，运行时走 CDN）`);
                }
            }
        }
    };
}
