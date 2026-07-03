// src/ui/popup/confirmacao.ts
import type { NormaImportada, ResultadoResolucao, LeiAcompanhada, CandidatoNorma } from '../../core/types';
import { resolverNorma } from '../../core/lexml/resolvedor';
import { buscarUrlPlanalto } from '../../core/lexml/ficha';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DepsResolverLote {
  fetchFn?: typeof fetch;
  intervaloMs?: number;
  onProgresso?: (i: number, total: number) => void;
  /** Rodadas extras para consultas com status 'falha' (LexML devolve 503 intermitente). */
  tentativasExtras?: number;
  /** Pausa antes de cada rodada de re-tentativa (cresce a cada rodada). */
  esperaReconsultaMs?: number;
}

export async function resolverLote(
  normas: NormaImportada[],
  deps: DepsResolverLote = {},
): Promise<ResultadoResolucao[]> {
  const { fetchFn = fetch, intervaloMs = 0, onProgresso, tentativasExtras = 2, esperaReconsultaMs = 2000 } = deps;

  let out: ResultadoResolucao[] = [];
  for (let i = 0; i < normas.length; i++) {
    out.push(await resolverNorma(normas[i], fetchFn));
    onProgresso?.(i + 1, normas.length);
    if (intervaloMs && i < normas.length - 1) await esperar(intervaloMs);
  }

  // O LexML devolve HTTP 503 esporádico sob sequência de consultas;
  // re-tenta apenas as falhas, uma a uma, com pausa crescente entre rodadas.
  for (let rodada = 1; rodada <= tentativasExtras; rodada++) {
    if (!out.some((r) => r.status === 'falha')) break;
    await esperar(esperaReconsultaMs * rodada);
    const reconsultadas: ResultadoResolucao[] = [];
    for (const r of out) {
      if (r.status !== 'falha') { reconsultadas.push(r); continue; }
      reconsultadas.push(await resolverNorma(r.norma, fetchFn));
      if (intervaloMs) await esperar(intervaloMs);
    }
    out = reconsultadas;
  }
  return out;
}

export function confirmarParaLeis(
  resultados: ResultadoResolucao[],
  escolhas: Record<number, string>,
): LeiAcompanhada[] {
  const leis: LeiAcompanhada[] = [];
  for (const r of resultados) {
    let cand: CandidatoNorma | undefined;
    if (r.status === 'confirmada') cand = r.candidatos[0];
    else if (r.status === 'ambigua') {
      const urnEscolhida = escolhas[r.norma.linha];
      cand = r.candidatos.find((c) => c.urn === urnEscolhida);
    }
    if (!cand) continue;
    leis.push({
      id: cand.urn, tipo: r.norma.tipo, numero: r.norma.numero, ano: r.norma.ano,
      titulo: cand.titulo, apelido: r.norma.apelido, urlPlanalto: r.norma.urlPlanalto,
      status: 'ativa', adicionadaEm: new Date().toISOString(),
    });
  }
  return leis;
}

// Enriquecimento opcional: para leis sem urlPlanalto, tenta obter da ficha LexML.
export async function preencherUrlsPlanalto(leis: LeiAcompanhada[], fetchFn: typeof fetch = fetch): Promise<LeiAcompanhada[]> {
  return Promise.all(leis.map(async (l) => l.urlPlanalto ? l : { ...l, urlPlanalto: (await buscarUrlPlanalto(l.id, fetchFn)) ?? undefined }));
}
