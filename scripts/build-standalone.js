// Builds coinrace-standalone.html: the whole game in one file, with the
// CSS and JS inlined. Run with: node scripts/build-standalone.js

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const html = await readFile(join(ROOT, 'web/index.html'), 'utf8');
const css = await readFile(join(ROOT, 'web/style.css'), 'utf8');
const gameJs = await readFile(join(ROOT, 'src/game.js'), 'utf8');
const appJs = await readFile(join(ROOT, 'web/app.js'), 'utf8');

const gamePlain = gameJs.replace(/^export /gm, '');
const appPlain = appJs.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/s, '');

const merged = gamePlain + '\n' + appPlain;

let out = html.replace(
  '<link rel="stylesheet" href="style.css">',
  '<style>\n' + css + '</style>',
);
out = out.replace(
  '<script type="module" src="app.js"></script>',
  '<script>\n' + merged + '\n</script>',
);

await writeFile(join(ROOT, 'coinrace-standalone.html'), out);
console.log('wrote coinrace-standalone.html (' + out.length + ' bytes)');
