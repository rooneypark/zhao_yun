import { defineConfig } from 'vite';

// Large offline reference files can be locked while they are being copied on Windows.
export default defineConfig({
  build: { rollupOptions: { input: { practice: 'index.html', overlord: 'overlord.html' } } },
  server: { watch: { ignored: ['**/reference/**', '**/source-art/**', '**/previews/**', '**/public/overlord/**'] } },
});
