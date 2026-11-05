import { defineConfig } from 'vite';

// Large offline reference files can be locked while they are being copied on Windows.
export default defineConfig({
  server: { watch: { ignored: ['**/reference/**', '**/source-art/**', '**/previews/**'] } },
});
