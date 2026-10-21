import express from 'express';
import cors from 'cors';
import { loadBikes } from './db.js';
import { lookup, NotFoundError } from './lookup.js';
import { ForbiddenUrlError, isAllowedOrigin } from './security.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1';

const app = express();
app.use(cors({ origin: (o, cb) => cb(null, isAllowedOrigin(o)) }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/bikes', async (_req, res) => {
  const bikes = await loadBikes();
  res.json(bikes.map(({ unverified: _u, productIds: _p, ...b }) => b));
});

app.post('/api/bike/lookup', async (req, res) => {
  const url = req.body?.url;
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: 'Champ "url" (http/https) requis.' });
    return;
  }
  try {
    res.json(await lookup(url));
  } catch (e) {
    if (e instanceof ForbiddenUrlError) res.status(400).json({ error: e.message });
    else if (e instanceof NotFoundError) res.status(404).json({ error: e.message });
    else res.status(500).json({ error: (e as Error).message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`API Bike Fit en écoute sur http://${HOST}:${PORT}`);
});
