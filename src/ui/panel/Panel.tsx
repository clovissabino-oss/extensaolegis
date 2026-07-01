// src/ui/panel/Panel.tsx
import { useEffect, useState } from 'preact/hooks';
import { abrirDb, listarLeis, listarInovacoes, marcarLida } from '../../core/repositorio/db';
import { montarLinhas, gerarExcel } from '../../core/exportador/excel';
import { gerarPdf } from '../../core/exportador/pdf';
import { bytesParaBlobXlsx, baixarBlob } from './download';
import type { Inovacao, LeiAcompanhada } from '../../core/types';

export function Panel() {
  const [leis, setLeis] = useState<LeiAcompanhada[]>([]);
  const [inov, setInov] = useState<Inovacao[]>([]);

  async function carregar() {
    const db = await abrirDb();
    setLeis(await listarLeis(db));
    setInov((await listarInovacoes(db)).sort((a, b) => b.detectadaEm.localeCompare(a.detectadaEm)));
  }
  useEffect(() => { void carregar(); }, []);

  async function lida(id: string) { const db = await abrirDb(); await marcarLida(db, id); await carregar(); }
  function exportarExcel() { baixarBlob('inovacoes.xlsx', bytesParaBlobXlsx(gerarExcel(montarLinhas(leis, inov)))); }
  function exportarPdf() { baixarBlob('inovacoes.pdf', gerarPdf(montarLinhas(leis, inov))); }

  const nome = new Map(leis.map((l) => [l.id, l.apelido || l.titulo]));
  return (
    <div style="padding:16px;font-family:sans-serif">
      <h2>Inovações detectadas</h2>
      <button onClick={exportarExcel}>Exportar Excel</button>{' '}
      <button onClick={exportarPdf}>Exportar PDF</button>
      <ul style="font-size:13px">
        {inov.map((i) => (
          <li key={i.id} style={i.lida ? 'opacity:.55' : 'font-weight:600'}>
            [{i.detectadaEm.slice(0, 10)}] {nome.get(i.leiId)} — {i.tipo === 'ALTERACAO' ? i.normaAlteradora?.descricao : i.resumoDiff?.preview}
            {!i.lida && <button style="margin-left:8px" onClick={() => lida(i.id)}>marcar lida</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
