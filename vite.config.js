import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  base: './',
  root: 'src/renderer',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: resolve(__dirname, 'src/renderer/panel.html'),
        mini: resolve(__dirname, 'src/renderer/mini.html'),
        tagpicker: resolve(__dirname, 'src/renderer/tagpicker.html'),
        reminder: resolve(__dirname, 'src/renderer/reminder.html')
      }
    }
  },
  server: {
    port: 5173,
    strictPort: false
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
})
