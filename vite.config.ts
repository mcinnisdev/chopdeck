import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: false },
  build: { rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), manual: fileURLToPath(new URL('./manual/index.html', import.meta.url)) } } },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
});
