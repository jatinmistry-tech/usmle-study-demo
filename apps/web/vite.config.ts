import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '');
  // Web-only overrides allow a standalone frontend without editing server env.
  const webEnv = { ...env, ...loadEnv(mode, '.', 'VITE_') };
  return {
    plugins: [react(), tailwindcss()],
    envDir: '../..',
    define: {
      'import.meta.env.VITE_USE_MOCK_DATA': JSON.stringify(webEnv.VITE_USE_MOCK_DATA ?? 'false'),
      'import.meta.env.VITE_BFF_URL': JSON.stringify(webEnv.VITE_BFF_URL ?? ''),
    },
    server: {
      port: 5173, strictPort: true,
      proxy: {
        '/bff': { target: `http://localhost:${env.BFF_PORT || '4000'}`, changeOrigin: true },
        '/api': { target: `http://localhost:${env.BFF_PORT || '4000'}`, changeOrigin: true },
      },
    },
  };
});
