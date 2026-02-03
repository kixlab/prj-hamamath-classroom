import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 프론트엔드 개발 서버 포트: 8000
    port: 8000,
    proxy: {
      '/api': {
        // 백엔드 API 서버 포트: 8001
        target: 'http://localhost:8001',
        changeOrigin: true,
        ws: false, // WebSocket은 프록시하지 않음
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
