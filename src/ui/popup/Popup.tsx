// src/ui/popup/Popup.tsx
import { useState } from 'preact/hooks';
import { detectarColunas, importarPlanilha, type MapaColunas } from '../../core/planilha/importador';
import { resolverLote, confirmarParaLeis, preencherUrlsPlanalto } from './confirmacao';
import { abrirDb, salvarLei } from '../../core/repositorio/db';
import type { ResultadoResolucao, StatusResolucao } from '../../core/types';
import { Coruja } from '../coruja';
import '../theme.css';

const ROTULO_STATUS: Record<StatusResolucao, string> = {
  confirmada: 'Confirmada',
  ambigua: 'Ambígua',
  nao_localizada: 'Não localizada',
};

export function Popup() {
  const [resultados, setResultados] = useState<ResultadoResolucao[]>([]);
  const [escolhas, setEscolhas] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState('Aguardando planilha de leis.');

  async function aoSelecionar(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    // Detecta colunas a partir do cabeçalho da 1ª aba.
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'array' });
    const cab = (XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0] ?? []) as string[];
    const mapa = detectarColunas(cab) as MapaColunas;
    if (!mapa.tipo || !mapa.numero || !mapa.ano) { setMsg('Planilha precisa de colunas Tipo, Número e Ano.'); return; }
    const { normas, erros } = importarPlanilha(buffer, mapa);
    setMsg(`Resolvendo ${normas.length} norma(s)…`);
    const res = await resolverLote(normas, { intervaloMs: 300, onProgresso: (i, t) => setMsg(`Resolvendo ${i}/${t}…`) });
    setResultados(res);
    setMsg(`${res.filter((r) => r.status === 'confirmada').length} confirmada(s), ${erros.length} erro(s) de planilha.`);
  }

  async function confirmar() {
    let leis = confirmarParaLeis(resultados, escolhas);
    leis = await preencherUrlsPlanalto(leis);
    const db = await abrirDb();
    for (const l of leis) await salvarLei(db, l);
    chrome.runtime.sendMessage({ tipo: 'verificar-agora' });
    setMsg(`${leis.length} lei(s) em monitoramento.`);
    setResultados([]);
  }

  return (
    <div class="popup">
      <header class="cabecalho">
        <Coruja tamanho={44} />
        <div class="cabecalho-titulos">
          <p class="cabecalho-eyebrow">Vigilância legislativa · Planalto</p>
          <h1 class="cabecalho-nome">Legis Monitor</h1>
        </div>
      </header>

      <div class="popup-corpo">
        <button class="btn btn-primario" onClick={() => chrome.tabs.create({ url: 'panel.html' })}>
          Abrir painel de inovações
        </button>
        <a class="link-modelo" href={chrome.runtime.getURL('modelo-legislacoes.xlsx')} download>
          Baixar planilha-modelo
        </a>

        <label class="protocolo">
          <svg class="protocolo-lupa" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="#F5821F" stroke-width="3" />
            <line x1="16.5" y1="16.5" x2="23" y2="23" stroke="#F5821F" stroke-width="3.5" stroke-linecap="round" />
          </svg>
          <span>
            <p class="protocolo-titulo">Enviar planilha de leis</p>
            <p class="protocolo-dica">.xlsx ou .csv · colunas Tipo, Número e Ano</p>
          </span>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={aoSelecionar} />
        </label>

        <p class="despacho">{msg}</p>

        {resultados.length > 0 && (
          <>
            <ul class="expediente">
              {resultados.map((r) => (
                <li key={r.norma.linha}>
                  <span class="norma-id">{r.norma.tipo} {r.norma.numero}/{r.norma.ano}</span>
                  <span class={`carimbo carimbo-${r.status}`}>{ROTULO_STATUS[r.status]}</span>
                  {r.status === 'ambigua' && (
                    <select onChange={(e) => setEscolhas((prev) => ({ ...prev, [r.norma.linha]: (e.target as HTMLSelectElement).value }))}>
                      <option value="">escolher…</option>
                      {r.candidatos.map((c) => <option key={c.urn} value={c.urn}>{c.urn}</option>)}
                    </select>
                  )}
                </li>
              ))}
            </ul>
            <button class="btn btn-primario" onClick={confirmar}>Confirmar e monitorar</button>
          </>
        )}
      </div>
    </div>
  );
}
