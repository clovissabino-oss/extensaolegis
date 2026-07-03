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
  falha: 'Falha na consulta',
};

function resumo(res: ResultadoResolucao[], errosPlanilha: number): string {
  const conta = (s: StatusResolucao) => res.filter((r) => r.status === s).length;
  const partes = [`${conta('confirmada')} confirmada(s)`];
  if (conta('ambigua')) partes.push(`${conta('ambigua')} ambígua(s)`);
  if (conta('nao_localizada')) partes.push(`${conta('nao_localizada')} não localizada(s)`);
  if (conta('falha')) partes.push(`${conta('falha')} falha(s) de consulta ao LexML`);
  if (errosPlanilha) partes.push(`${errosPlanilha} erro(s) de planilha`);
  return partes.join(', ') + '.';
}

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
    setMsg(resumo(res, erros.length));
  }

  async function reconsultarFalhas() {
    const pendentes = resultados.filter((r) => r.status === 'falha').map((r) => r.norma);
    setMsg(`Reconsultando ${pendentes.length} norma(s)…`);
    const novos = await resolverLote(pendentes, { intervaloMs: 500, onProgresso: (i, t) => setMsg(`Reconsultando ${i}/${t}…`) });
    const porLinha = new Map(novos.map((n) => [n.norma.linha, n]));
    const mesclados = resultados.map((r) => porLinha.get(r.norma.linha) ?? r);
    setResultados(mesclados);
    setMsg(resumo(mesclados, 0));
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
                  <span class={`carimbo carimbo-${r.status}`} title={r.motivo}>{ROTULO_STATUS[r.status]}</span>
                  {r.status === 'ambigua' && (
                    <select onChange={(e) => setEscolhas((prev) => ({ ...prev, [r.norma.linha]: (e.target as HTMLSelectElement).value }))}>
                      <option value="">escolher…</option>
                      {r.candidatos.map((c) => <option key={c.urn} value={c.urn}>{c.urn}</option>)}
                    </select>
                  )}
                </li>
              ))}
            </ul>
            {resultados.some((r) => r.status === 'falha') && (
              <button class="btn btn-fantasma" onClick={reconsultarFalhas}>Reconsultar falhas</button>
            )}
            <button class="btn btn-primario" onClick={confirmar}>Confirmar e monitorar</button>
          </>
        )}
      </div>
    </div>
  );
}
