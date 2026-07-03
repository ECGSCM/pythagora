import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['*.png', '*.jpg', '*.svg', '*.ico'],
      manifest: {
        name: 'Pythagora Synth',
        short_name: 'Pythagora',
        description: 'Physics-based modular synthesizer for creating music with marbles',
        theme_color: '#0A0A0F',
        background_color: '#0A0A0F',
        display: 'standalone',
        icons: [
          // No raster PNGs are checked in — no PNG converter (rsvg-convert,
          // inkscape, sharp) was available in this environment, and the
          // project deliberately avoids adding a new npm dependency just for
          // icon export. Every evergreen browser that installs this PWA
          // accepts a single SVG source at multiple declared sizes, so the
          // same icon.svg is listed under 'any' and 'maskable' at both
          // common install sizes rather than shipping missing/broken PNG
          // paths. The src is relative (no leading slash): this manifest is
          // served from under the '/pythagora/' base, and an icon's 'src' is
          // resolved relative to the manifest's own URL, not domain root —
          // an absolute '/icon.svg' would 404 on GitHub Pages.
          {
            src: 'icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 365 * 24 * 60 * 60
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  base: '/pythagora/', // GitHub Pages base path (custom repo name)
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Note: there is deliberately no 'react-vendor' bucket here. React
          // is consumed via subpath entry points ('react/jsx-runtime' from
          // the automatic JSX transform, 'react-dom/client' from main.tsx)
          // rather than the bare 'react'/'react-dom' specifiers, and its
          // heaviest consumer (@react-three/fiber's reconciler) pulls it in
          // as part of the three-fiber dependency graph. Naming an explicit
          // 'react-vendor' chunk here only produced a zero-byte chunk
          // (Rollup still resolved the runtime into whichever chunk first
          // needed it) — removed rather than shipping a dead empty file.
          // Three.js ecosystem
          'three-core': ['three'],
          'three-fiber': ['@react-three/fiber', '@react-three/drei'],
          'three-cannon': ['@react-three/cannon'],
          // Audio
          'tone': ['tone'],
          // UI
          'mui': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  optimizeDeps: {
    include: ['three', 'tone', '@react-three/fiber', '@react-three/drei']
  }
})
