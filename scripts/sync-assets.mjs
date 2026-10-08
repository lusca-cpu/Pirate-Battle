// Copies the sprites the game uses from the challenge pack (assets/png/default)
// into public/assets so Vite serves them at /assets/... in dev and in the build.
// Run automatically by `npm run dev` / `npm run build` (see package.json).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const from = resolve(root, 'assets/png/default');
const to = resolve(root, 'public/assets');

if (!existsSync(from)) {
  console.error(`sync-assets: ${from} not found. Run this from the repository root.`);
  process.exit(1);
}

mkdirSync(to, { recursive: true });
for (const dir of ['ships', 'ship_parts', 'effects', 'tiles', 'ui']) {
  cpSync(resolve(from, dir), resolve(to, dir), { recursive: true });
}
cpSync(resolve(root, 'assets/ui_scene_background.png'), resolve(to, 'ui_scene_background.png'));
console.log('sync-assets: copied sprites to public/assets');
