import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

import { VitePWA } from 'vite-plugin-pwa';

// Custom plugin to emulate Vercel serverless functions locally
const vercelApiPlugin = () => ({
  name: 'vercel-api',
  configureServer(server: any) {
    server.middlewares.use('/api/apuracao', async (req: any, res: any) => {
      // Polyfill Vercel/Express features
      res.status = (code: number) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data: any) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      };

      try {
        const { default: handler } = await server.ssrLoadModule('/api/apuracao.ts');
        await handler(req, res);
      } catch (e: any) {
        console.error('Error in local API handler:', e);
        res.statusCode = 500;
        res.end(JSON.stringify({ erro: e.message }));
      }
    });
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      vercelApiPlugin(),
    ],
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
