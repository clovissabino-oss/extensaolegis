// src/background/service-worker.ts
import { abrirDb } from '../core/repositorio/db';
import { executarCiclo, periodoEmMinutos } from './agendador';

const ALARM = 'verificacao-legis';

async function frequencia(): Promise<'horaria' | 'diaria' | 'semanal'> {
  const { frequencia } = await chrome.storage.local.get('frequencia');
  return frequencia ?? 'diaria';
}

async function agendar(): Promise<void> {
  chrome.alarms.create(ALARM, { periodInMinutes: periodoEmMinutos(await frequencia()) });
}

async function rodar(): Promise<void> {
  const db = await abrirDb();
  let seq = Date.now();
  const { totalInovacoes, naoLidas } = await executarCiclo(db, {
    agora: () => new Date().toISOString(),
    gerarId: () => `inv_${seq++}`,
  });
  await chrome.action.setBadgeText({ text: naoLidas > 0 ? String(naoLidas) : '' });
  const { popupAtivo } = await chrome.storage.local.get('popupAtivo');
  if (totalInovacoes > 0 && popupAtivo !== false) {
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon-128.png', title: 'Legis Monitor',
      message: `${totalInovacoes} nova(s) inovação(ões) detectada(s).`,
    });
  }
}

chrome.runtime.onInstalled.addListener(agendar);
chrome.runtime.onStartup.addListener(agendar);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) void rodar(); });
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg?.tipo === 'verificar-agora') { void rodar().then(() => sendResponse({ ok: true })); return true; }
  if (msg?.tipo === 'reagendar') { void agendar().then(() => sendResponse({ ok: true })); return true; }
  return false;
});
