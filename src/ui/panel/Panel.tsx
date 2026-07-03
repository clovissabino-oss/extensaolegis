// src/ui/panel/Panel.tsx
import { useEffect, useState } from 'preact/hooks';
import { abrirDb, listarLeis, listarInovacoes, marcarLida } from '../../core/repositorio/db';
import { montarLinhas, gerarExcel } from '../../core/exportador/excel';
import { gerarPdf } from '../../core/exportador/pdf';
import { bytesParaBlobXlsx, baixarBlob } from './download';
import type { Inovacao, LeiAcompanhada } from '../../core/types';
import { Coruja } from '../coruja';
import '../theme.css';

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
    <div class="pagina">
      <header class="cabecalho">
        <Coruja tamanho={44} />
        <div class="cabecalho-titulos">
          <p class="cabecalho-eyebrow">Vigilância legislativa · Planalto</p>
          <h1 class="cabecalho-nome">Legis Monitor</h1>
        </div>
      </header>

      <div class="pagina-corpo">
        <h2>Inovações detectadas</h2>
        <div class="pagina-acoes">
          <button class="btn btn-fantasma" onClick={exportarExcel}>Exportar Excel</button>
          <button class="btn btn-fantasma" onClick={exportarPdf}>Exportar PDF</button>
        </div>

        {inov.length === 0 ? (
          <p class="vazio">Nenhuma inovação registrada. As leis monitoradas são verificadas automaticamente — a coruja segue de plantão.</p>
        ) : (
          <ul class="inovacoes">
            {inov.map((i) => (
              <li key={i.id} class={i.lida ? 'inovacao inovacao-lida' : 'inovacao'}>
                <span class="inovacao-data">{i.detectadaEm.slice(0, 10)}</span>
                <span class="inovacao-lei">{nome.get(i.leiId)}</span>
                <span>{i.tipo === 'ALTERACAO' ? i.normaAlteradora?.descricao : i.resumoDiff?.preview}</span>
                {!i.lida && <button class="btn btn-fantasma btn-mini" onClick={() => lida(i.id)}>Marcar como lida</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
