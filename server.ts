import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './src/server/routes.ts';
import { attachWebSocketServer } from './src/server/ws.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  // Ensure uploads directory exists
  const uploadsDir = path.resolve(__dirname, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  // Basic security headers & Capacitor Android WebView CORS
  const allowedOrigins = new Set(
    [
      'https://localhost',
      'http://localhost',
      'capacitor://localhost',
      process.env.APP_URL,
    ]
      .filter(Boolean)
      .map((u) => String(u).replace(/\/+$/, ''))
  );

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.has(origin) || origin.startsWith('http://localhost:'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve uploaded files safely
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );

  // Mount API routes
  app.use('/api', createApiRouter(uploadsDir));

  // Vite dev middleware vs static production dist
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  attachWebSocketServer(httpServer);

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`[InteriorX] Server running on http://0.0.0.0:${port} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[InteriorX] Fatal startup error:', err);
  process.exit(1);
});
