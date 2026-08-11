// server/index.js
//
// Boot the v2 mock backend. Single Express app, two routers:
//   - /api/buildings  -> server/routes/buildings.js
//   - /               -> server/routes/static.js (index.html + js/css/docs)
//
// The API is mounted first so any /api/* path wins over the static fallback.
// Data is generated at module load (deterministic seed) and held in memory.

import express from 'express';

import buildingsRouter from './routes/buildings.js';
import staticRouter from './routes/static.js';
import { generateData } from './data-generator.js';

const PORT = Number(process.env.PORT) || 8000;
const HOST = '0.0.0.0';

// Generate the dataset up front so the boot log can report counts. The
// generator caches the result, so each /api call reuses the same in-memory
// snapshot.
const { stats } = generateData();

const app = express();

app.use('/api/buildings', buildingsRouter);
// Static fallback is mounted AFTER the API so /api/* wins on conflict.
app.use(staticRouter);

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(
    `listening on ${PORT}, generated ${stats.buildings} buildings, ` +
      `${stats.cables} cables in ${stats.cbdMs} ms`
  );
});