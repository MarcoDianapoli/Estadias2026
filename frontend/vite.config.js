import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Los QR antiguos apuntaban a /inventario.html?ficha=<token>.
// Se redirigen a la ruta SPA /ficha antes de que Vite sirva archivos HTML,
// para que /inventario no entre en conflicto con un archivo inventario.html.
const legacyQrRedirect = {
  name: 'legacy-qr-redirect',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url && req.url.startsWith('/inventario.html')) {
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('ficha');
        res.statusCode = 302;
        res.setHeader('Location', token
          ? `/ficha?ficha=${encodeURIComponent(token)}`
          : '/inventario');
        res.end();
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), legacyQrRedirect],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'ws://localhost:3001', ws: true, changeOrigin: true },
    },
  },
});
