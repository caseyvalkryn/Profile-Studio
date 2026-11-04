/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Production CSP only: Vite HMR needs looser script rules in `npm run dev`. */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'";

function cspMeta(): Plugin {
  return {
    name: 'html-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // Skip the Vite dev server (HMR / @vite/client). Apply for build and preview.
        if (ctx.server) return html;
        if (html.includes('http-equiv="Content-Security-Policy"')) return html;
        return html.replace(
          /<head>/i,
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMeta()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
