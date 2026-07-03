import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  build: {
    rollupOptions: {
      // panel.html não é entrada do manifest (só web_accessible_resources),
      // então precisa ser declarado aqui para o Vite compilá-lo.
      input: { panel: 'panel.html' },
    },
  },
});
