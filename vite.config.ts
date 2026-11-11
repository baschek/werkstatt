/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Werkstatt',
        short_name: 'Werkstatt',
        description: 'Katalog der Kellerwerkstatt',
        lang: 'de',
        display: 'standalone',
        background_color: '#c3c7cb',
        theme_color: '#0d3b66',
        start_url: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,svg,png}'], navigateFallback: 'index.html' },
    }),
  ],
  build: { chunkSizeWarningLimit: 900 },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
})
