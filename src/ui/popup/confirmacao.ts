// src/ui/popup/confirmacao.ts
import type { NormaImportada, ResultadoResolucao, LeiAcompanhada, CandidatoNorma } from '../../core/types';
import { resolverNorma } from '../../core/lexml/resolvedor';
import { buscarUrlPlanalto } from '../../core/lexml/ficha';

export async function resolverLote(
  normas: NormaImportada[],
  deps: { fetchFn?: typeof fetch; intervaloMs?: number; onProgresso?: (i: number, total: number) => void } = {},
): Promise<ResultadoResolucao[]> {
  const out: ResultadoResolucao[] = [];
  for (let i = 0; i < normas.length; i++) {
    out.push(await resolverNorma(normas[i], deps.fetchFn ?? fetch));
    deps.onProgresso?.(i + 1, normas.length);
    if (deps.intervaloMs) await new Promise((r) => setTimeout(r, deps.intervaloMs));
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
