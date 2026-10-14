import path from 'path'

import vue from '@vitejs/plugin-vue'
import frappeui from 'frappe-ui/vite'
import { defineConfig } from 'vite'

const suiteSrc = path.resolve(__dirname, '../../suite/frontend/src')

const stripJinja = () => ({
  name: 'photos-native-html',
  transformIndexHtml: (html: string) =>
    html
      .replace(/data-theme-mode="[^"]*"/, 'data-theme-mode="automatic"')
      .replace(/data-theme="[^"]*"/, 'data-theme="automatic"')
      .replace(/<meta\s+name="theme-color"[\s\S]*?\/>/, '<meta name="theme-color" content="#ffffff" />')
      .replace(/<link rel="manifest"[^>]*>/, '')
      .replace(/<script>\s*window\.csrf_token[\s\S]*?<\/script>/, ''),
})

export default defineConfig({
  base: '/',
  define: {
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    __SITE_NAME__: JSON.stringify(''),
    __SOCKETIO_PORT__: JSON.stringify(9000),
    'import.meta.env.VITE_NATIVE': JSON.stringify('1'),
  },
  plugins: [
    frappeui({ frappeProxy: false, lucideIcons: true, jinjaBootData: false, buildConfig: false }),
    vue(),
    stripJinja(),
  ],
  resolve: {
    alias: [
      { find: /^@\/apps\/drive\/socket$/, replacement: path.resolve(__dirname, 'src/native/socket.ts') },
      { find: /^@\/router$/, replacement: path.resolve(__dirname, 'src/router.ts') },
      { find: '@', replacement: suiteSrc },
      { find: 'tailwind.config.js', replacement: path.resolve(__dirname, 'tailwind.config.js') },
    ],
    dedupe: ['vue', 'vue-router', 'pinia', 'frappe-ui', 'reka-ui', 'dayjs'],
  },
  build: {
    outDir: 'dist-native',
    emptyOutDir: true,
    target: 'es2020',
    commonjsOptions: { include: [/tailwind.config.js/, /node_modules/] },
  },
})
