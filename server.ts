import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMissingConfig } from './src/server/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  // Fail closed before the app (and any database) is loaded.
  const missing = getMissingConfig();
  if (missing.length > 0) {
    console.error(
      `[Natkhat Café] Refusing to start: missing required environment variables: ${missing.join(', ')}`
    );
    process.exit(1);
  }

  const { app } = await import('./src/server/app');
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use((await import('express')).default.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Natkhat Café] Full-Stack server running at http://localhost:${PORT}`);
  });
}

startServer();
