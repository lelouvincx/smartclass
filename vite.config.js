import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    allowedHosts: process.env.AMP_ORB ? true : undefined,
    proxy: process.env.API_TARGET
      ? {
          '/api': {
            target: process.env.API_TARGET,
            changeOrigin: true,
          },
        }
      : undefined,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}', 'worker/**/*.test.{js,jsx}'],
    exclude: ['worker/**/*.integration.test.{js,jsx}', 'node_modules'],
  },
})
