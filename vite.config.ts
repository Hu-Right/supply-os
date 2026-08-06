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
            // P1 性能优化：图标库 + 动画库独立分割——按需加载、缓存隔离
            // 回滚：删除以下两行即可
            'vendor-icons': ['lucide-react'],
            'vendor-motion': ['motion'],
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
