import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Extensão Legis Monitor',
  version: '0.1.0',
  description: 'Monitora inovações em legislação federal (Planalto) a partir de uma planilha.',
  action: { default_popup: 'popup.html', default_title: 'Legis Monitor' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  permissions: ['alarms', 'notifications', 'storage'],
  host_permissions: ['https://www.lexml.gov.br/*', 'https://www.planalto.gov.br/*'],
});
