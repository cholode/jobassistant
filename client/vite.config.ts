import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { randomBytes } from 'node:crypto';
const nonce = randomBytes(18).toString('base64');
export default defineConfig({
  base: './',
  html: { cspNonce: nonce },
  plugins: [
    { name: 'app-csp', transformIndexHtml: { order: 'pre', handler: html => html.replace('__APP_NONCE__', nonce) } },
    react(), tailwind(),
  ],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
