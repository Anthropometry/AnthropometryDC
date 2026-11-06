import type { VitePWAOptions } from 'vite-plugin-pwa'

/**
 * PWA settings. The service worker precaches only this app's own built files. There is no
 * runtimeCaching on purpose: /api, Supabase and the Turnstile script are never served from cache
 * (tested in src/pwa-config.test.ts).
 */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  includeAssets: ['icons/apple-touch-icon.png', 'icons/icon.svg'],
  manifest: {
    name: 'Anthro Collect — Ashesi student research',
    short_name: 'Anthro Collect',
    description: 'Field data collection for a student research project at Ashesi University.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0f766e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    navigateFallback: '/index.html',
    // Never let the service worker answer API calls from cache.
    navigateFallbackDenylist: [/^\/api\//],
  },
}
