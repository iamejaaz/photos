import fs from 'fs'
import path from 'path'

import vue from '@vitejs/plugin-vue'
import frappeui from 'frappe-ui/vite'
import { defineConfig } from 'vite'

const suiteSrc = path.resolve(__dirname, '../../suite/frontend/src')
const commonSiteConfigPath = path.resolve(__dirname, '../../../sites/common_site_config.json')
const commonSiteConfig = fs.existsSync(commonSiteConfigPath)
  ? JSON.parse(fs.readFileSync(commonSiteConfigPath, 'utf-8'))
  : {}

export default defineConfig(({ mode }) => ({
  define: {
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    __SITE_NAME__: JSON.stringify(commonSiteConfig.default_site || 'localhost'),
    __SOCKETIO_PORT__: JSON.stringify(commonSiteConfig.socketio_port || 9000),
  },
  base: mode === 'production' ? '/assets/photos/frontend/' : '/',
  plugins: [
    frappeui({
      frappeProxy: true,
      lucideIcons: true,
      jinjaBootData: true,
      buildConfig: {
        outDir: '../photos/public/frontend',
        baseUrl: '/assets/photos/frontend/',
        indexHtmlPath: '../photos/www/photos.html',
        emptyOutDir: true,
        sourcemap: true,
      },
    }),
    vue(),
  ],
  resolve: {
    alias: [
      { find: /^@\/router$/, replacement: path.resolve(__dirname, 'src/router.ts') },
      { find: '@', replacement: suiteSrc },
      { find: 'tailwind.config.js', replacement: path.resolve(__dirname, 'tailwind.config.js') },
    ],
    dedupe: ['vue', 'vue-router', 'pinia', 'frappe-ui', 'reka-ui', 'dayjs'],
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      include: [/tailwind.config.js/, /node_modules/],
    },
  },
  server: {
    port: 8086,
    fs: { allow: ['..', '../../suite', '../../..'] },
  },
}))
