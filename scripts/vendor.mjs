import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(root, 'vendor');
const required = [
  'stockfish-19-lite-single.js',
  'stockfish-19-lite-single.wasm',
  'cm-chessboard/assets/chessboard.css'
];

fs.mkdirSync(vendorDir, { recursive: true });
const missing = required.filter(file => !fs.existsSync(path.join(vendorDir, file)));

if (missing.length) {
  console.warn('Missing vendor assets:');
  for (const file of missing) console.warn(` - ${file}`);
  console.warn('');
  console.warn('This project expects the vendor folder to already contain the stockfish WASM and cm-chessboard assets.');
  console.warn('See README.md for the setup steps, or run the project from the checked-in vendor directory.');
  process.exitCode = 1;
} else {
  console.log('Vendor assets present.');
}
