// e2e/fluxo.spec.ts
import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';

test('importa planilha-modelo e confirma leis', async () => {
  const pathToExtension = resolve('dist');
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
  });
  // descobre o id da extensão via service worker
  const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.setInputFiles('input[type=file]', resolve('public/modelo-legislacoes.xlsx'));
  await expect(page.locator('text=confirmada')).toBeVisible({ timeout: 30000 });
  await page.click('text=Confirmar e monitorar');
  await expect(page.locator('text=em monitoramento')).toBeVisible({ timeout: 30000 });
  await ctx.close();
});
