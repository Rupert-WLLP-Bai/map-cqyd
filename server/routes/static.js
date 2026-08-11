// server/routes/static.js
//
// Static-file router. Serves the demo's frontend (index.html + js/ + css/ +
// docs/) from the project root, NOT from server/. The server/ tree holds the
// backend only and is never exposed over HTTP.

import { Router } from 'express';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is two levels up from server/routes/.
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const router = Router();

// GET / and GET /index.html  -> project root's index.html. Both paths
// resolve to the same file so a bare visit and an explicit /index.html
// request both succeed (the browser-side fetch chain does request the
// literal /index.html path).
router.get('/', (_req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, 'index.html'));
});
router.get('/index.html', (_req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, 'index.html'));
});

// GET /js/*, GET /css/*, GET /docs/*  -> respective subdirs of project root.
// express.static falls through on miss (returns 404) without killing the
// rest of the router chain.
router.use(
  '/js',
  express.static(path.join(PROJECT_ROOT, 'js'), { fallthrough: true })
);
router.use(
  '/css',
  express.static(path.join(PROJECT_ROOT, 'css'), { fallthrough: true })
);
router.use(
  '/docs',
  express.static(path.join(PROJECT_ROOT, 'docs'), { fallthrough: true })
);

export default router;