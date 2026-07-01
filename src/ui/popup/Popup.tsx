// src/ui/popup/Popup.tsx
import { useState } from 'preact/hooks';
import { detectarColunas, importarPlanilha, type MapaColunas } from '../../core/planilha/importador';
import { resolverLote, confirmarParaLeis, preencherUrlsPlanalto } from './confirmacao';
import { abrirDb, salvarLei } from '../../core/repositorio/db';
import type { ResultadoResolucao } from '../../core/types';

export function Popup() {
  const [resultados, setResultados] = useState<ResultadoResolucao[]>([]);
  const [escolhas, setEscolhas] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState('Selecione a planilha de leis (.xlsx/.csv).');

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
    <div style="width:360px;padding:12px;font-family:sans-serif">
      <h3>Legis Monitor</h3>
      <button onClick={() => chrome.tabs.create({ url: 'panel.html' })} style="margin-bottom:8px">Abrir Painel</button>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={aoSelecionar} />
      <p style="font-size:12px">{msg}</p>
      {resultados.length > 0 && (
        <>
          <ul style="max-height:260px;overflow:auto;font-size:12px;padding-left:16px">
            {resultados.map((r) => (
              <li key={r.norma.linha}>
                {r.norma.tipo} {r.norma.numero}/{r.norma.ano} — <b>{r.status}</b>
                {r.status === 'ambigua' && (
                  <select onChange={(e) => setEscolhas((prev) => ({ ...prev, [r.norma.linha]: (e.target as HTMLSelectElement).value }))}>
                    <option value="">escolher…</option>
                    {r.candidatos.map((c) => <option key={c.urn} value={c.urn}>{c.urn}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>
          <button onClick={confirmar}>Confirmar e monitorar</button>
        </>
      )}
    </div>
  );
}
