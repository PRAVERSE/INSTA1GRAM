/**
 * Build script for Cloudflare Pages
 * Copies static website assets into the public/ directory.
 * Pages Functions in functions/ are automatically bundled by Cloudflare Pages.
 */

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const staticAssets = [
  'index.html',
  'telegram-notify.js',
  'favicon.svg',
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'android-chrome-192x192.png'
];

let copied = 0;
for (const file of staticAssets) {
  const src = path.join(rootDir, file);
  const dest = path.join(publicDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    copied++;
  }
}

console.log(`[Build] Successfully synchronized ${copied} static assets to public/`);
