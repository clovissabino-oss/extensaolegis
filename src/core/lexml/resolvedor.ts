// src/core/lexml/resolvedor.ts
import type { NormaImportada, ResultadoResolucao, CandidatoNorma, TipoNorma } from '../types';
import { SEGMENTO_URN } from './urnTipos';

const BASE_BUSCA = 'https://www.lexml.gov.br/busca/search?keyword=';
const BASE_URN = 'https://www.lexml.gov.br/urn/';

export function segmentoUrn(tipo: TipoNorma): string {
  return SEGMENTO_URN[tipo];
}

// Extrai todas as URNs federais do HTML de resultado.
function extrairUrns(html: string): string[] {
  const re = /\/urn\/(urn:lex:br:federal:[a-z.]+:\d{4}-\d{2}-\d{2};[\w.-]+)/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) set.add(m[1]);
  return [...set];
}

interface UrnPartes { seg: string; ano: number; numero: string; }
function parseUrn(urn: string): UrnPartes | null {
  const m = urn.match(/^urn:lex:br:federal:([a-z.]+):(\d{4})-\d{2}-\d{2};([\w.-]+)$/);
  if (!m) return null;
  return { seg: m[1], ano: parseInt(m[2], 10), numero: m[3].replace(/\./g, '') };
}

export async function resolverNorma(
  norma: NormaImportada,
  fetchFn: typeof fetch = fetch,
): Promise<ResultadoResolucao> {
  const termos = `${norma.tipo} ${norma.numero} ${norma.ano}`;
  const url = BASE_BUSCA + encodeURIComponent(termos);
  let html: string;
  try {
    const resp = await fetchFn(url);
    if (!resp.ok) return { norma, status: 'nao_localizada', candidatos: [], motivo: `HTTP ${resp.status}` };
    html = await resp.text();
  } catch (e) {
    return { norma, status: 'nao_localizada', candidatos: [], motivo: `Falha de rede: ${(e as Error).message}` };
  }

  const segAlvo = segmentoUrn(norma.tipo);
  const candidatos: CandidatoNorma[] = extrairUrns(html)
    .map((urn) => ({ urn, partes: parseUrn(urn) }))
    .filter((x) => x.partes && x.partes.seg === segAlvo && x.partes.numero === norma.numero && x.partes.ano === norma.ano)
    .map((x) => ({
      urn: x.urn,
      titulo: `${norma.tipo} nº ${norma.numero}/${norma.ano}`,
      urlLexml: BASE_URN + x.urn,
    }));

  if (candidatos.length === 0) return { norma, status: 'nao_localizada', candidatos: [], motivo: 'Sem correspondência no LexML' };
  if (candidatos.length === 1) return { norma, status: 'confirmada', candidatos };
  return { norma, status: 'ambigua', candidatos };
}
