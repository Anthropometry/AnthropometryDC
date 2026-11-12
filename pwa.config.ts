import type { VitePWAOptions } from 'vite-plugin-pwa'

/**
 * PWA settings. The service worker precaches only this app's own built files. The one runtime cache
 * is for the camera tools (F6 Amendment A): same-origin /mediapipe/ and /models/ only, downloaded once
 * on first camera use (src/lib/cameraFiles.ts) and then served offline. /api, Supabase and the
 * Turnstile script are never served from cache (tested in src/pwa-config.test.ts).
 */

/** Must match CAMERA_CACHE in src/lib/cameraFiles.ts (tested). */
export const CAMERA_CACHE_NAME = 'camera-tools-0.10.35-v1'
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
    // The install stays small: the camera tools (MediaPipe runtime .wasm and the models, about 18 MB)
    // are not precached (Ryan, 12 Nov: collectors use their own phones and mobile data).
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    globIgnores: ['mediapipe/**', 'models/**'],
    // Camera tools: from their own cache once downloaded (first camera use), so photos work offline.
    runtimeCaching: [
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && (url.pathname.startsWith('/mediapipe/') || url.pathname.startsWith('/models/')),
        handler: 'CacheFirst',
        options: { cacheName: CAMERA_CACHE_NAME },
      },
    ],
    navigateFallback: '/index.html',
    // Never let the service worker answer API calls from cache.
    navigateFallbackDenylist: [/^\/api\//],
  },
}
