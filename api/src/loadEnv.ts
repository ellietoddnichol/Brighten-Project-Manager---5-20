import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const name of ['.env.local', '.env']) {
  const file = path.join(apiRoot, name);
  if (fs.existsSync(file)) {
    dotenv.config({ path: file });
  }
}
