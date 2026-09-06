import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: false, proxy: { '/api': 'http://localhost:8788' } },
  build: { rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), manual: fileURLToPath(new URL('./manual/index.html', import.meta.url)), account: fileURLToPath(new URL('./account/index.html', import.meta.url)), terms: fileURLToPath(new URL('./terms/index.html', import.meta.url)), privacy: fileURLToPath(new URL('./privacy/index.html', import.meta.url)), kits: fileURLToPath(new URL('./kits/index.html', import.meta.url)), kitsPublish: fileURLToPath(new URL('./kits/publish/index.html', import.meta.url)) } } },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.ts'], testTimeout: 20000 },
});
