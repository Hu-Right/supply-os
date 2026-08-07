import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      // 静态资源文件名加内容哈希，内容变化 → 哈希变化 → 文件名变化 → 浏览器必须重新下载
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          // P0 性能优化：vendor chunk 分割——第三方依赖独立缓存，内容不变则文件名不变
          // 回滚：删除 manualChunks 块即可恢复原始行为
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-i18n': ['i18next', 'react-i18next'],
            // P1 性能优化：图标库独立分割——lucide-react 已使用命名导入，Vite 自动 tree-shaking
            // 仅打包实际使用的图标（Crown/Search/ChevronDown 等），未使用图标零体积
            // 回滚：删除以下行即可
            'vendor-icons': ['lucide-react'],
            // P0 性能优化：UI 工具库独立分割——tailwind-merge 被 Button/Input/Select 使用
            // 独立后可被多个页面共享缓存，减少重复加载
            // 回滚：删除以下行即可
            'vendor-utils': ['tailwind-merge'],
            // [2026-08-07] motion 库已从 manualChunks 移除——项目零导入 motion，
            // 所有动画均由 Tailwind CSS 类（animate-spin/pulse/ping）实现。
            // 原配置生成空 chunk "vendor-motion" (0.00 kB)，属无效配置。
            // 如需恢复：添加 'vendor-motion': ['motion'] 并确保 motion 已安装
          },
          assetFileNames: (assetInfo) => {
            const ext = path.extname(assetInfo.name ?? '').replace(/^\./, '');
            if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(assetInfo.name ?? '')) {
              return `assets/images/[name]-[hash].${ext}`;
            }
            if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name ?? '')) {
              return `assets/fonts/[name]-[hash].${ext}`;
            }
            return `assets/[name]-[hash].${ext}`;
          },
        },
      },
      // 生成 manifest.json 供服务端版本比对
      manifest: true,
      // P1 性能优化：生产环境关闭 sourcemap 减少部署体积（开发模式由 Vite 内联提供）
      // 回滚：将 false 改回 true
      sourcemap: false,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // 允许外部域名访问开发服务器
      allowedHosts: ['osneosmart.com'],
    },
  };
});
