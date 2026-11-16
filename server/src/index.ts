import { createApp } from './app.js';
import { getDb } from './db/db.js';

getDb();
const port = Number(process.env.PORT) || 4000;
createApp().listen(port, () => {
  console.log(`Stock Register server running on http://localhost:${port}`);
});
