// scripts/gerar-icone.mjs — renderiza a coruja investigativa em public/icon-128.png.
// Mantém o mesmo desenho de src/ui/coruja.tsx. Uso: node scripts/gerar-icone.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const svg = `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="128" height="128" rx="28" fill="#0E2033" />
  <path d="M26 44 L30 16 L50 34 Z" fill="#F6F2E8" />
  <path d="M102 44 L98 16 L78 34 Z" fill="#F6F2E8" />
  <circle cx="46" cy="62" r="33" fill="#F6F2E8" />
  <circle cx="82" cy="62" r="33" fill="#F6F2E8" />
  <rect x="30" y="62" width="68" height="30" rx="15" fill="#F6F2E8" />
  <circle cx="43" cy="60" r="15" fill="#FFFFFF" stroke="#1C3B5A" stroke-width="3.5" />
  <circle cx="43" cy="60" r="7.5" fill="#0E2033" />
  <circle cx="46" cy="57" r="2.4" fill="#FFFFFF" />
  <circle cx="84" cy="58" r="20" fill="#FFFFFF" />
  <circle cx="84" cy="58" r="10.5" fill="#0E2033" />
  <circle cx="88.5" cy="53.5" r="3.2" fill="#FFFFFF" />
  <circle cx="84" cy="58" r="20" fill="none" stroke="#F5821F" stroke-width="6" />
  <line x1="99" y1="73" x2="114" y2="90" stroke="#F5821F" stroke-width="10" stroke-linecap="round" />
  <path d="M61 76 L54 86 L61 98 L68 86 Z" fill="#F5821F" />
</svg>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>body{margin:0}</style>${svg}`);
  const destino = path.join(raiz, 'public', 'icon-128.png');
  await page.locator('svg').screenshot({ path: destino, omitBackground: true });
  process.stdout.write(`Ícone gerado em ${destino}\n`);
} finally {
  await browser.close();
}
