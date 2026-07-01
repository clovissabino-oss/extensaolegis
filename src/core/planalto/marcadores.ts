// src/core/planalto/marcadores.ts
export interface Marcador { chave: string; tipoMarcador: string; norma: string }

const RE_MARCADOR =
  /\((Reda[çc][ãa]o dada|Inclu[íi]d[oa]|Acrescid[oa]|Revogad[oa])\s+pel[oa]\s+([^)]+?)\)/gi;

function tipoCanonico(bruto: string): string {
  const b = bruto.toLowerCase();
  if (b.startsWith('reda')) return 'REDACAO';
  if (b.startsWith('inclu')) return 'INCLUSAO';
  if (b.startsWith('acresc')) return 'INCLUSAO';
  return 'REVOGACAO';
}

export function extrairMarcadores(textoNorm: string): Marcador[] {
  const mapa = new Map<string, Marcador>();
  let m: RegExpExecArray | null;
  RE_MARCADOR.lastIndex = 0;
  while ((m = RE_MARCADOR.exec(textoNorm)) !== null) {
    const tipoMarcador = tipoCanonico(m[1]);
    const norma = m[2].replace(/\s+/g, ' ').trim();
    const chave = `${tipoMarcador}|${norma.toLowerCase()}`;
    if (!mapa.has(chave)) mapa.set(chave, { chave, tipoMarcador, norma });
  }
  return [...mapa.values()];
}

export function marcadoresNovos(anteriores: string[], atuais: Marcador[]): Marcador[] {
  const set = new Set(anteriores);
  return atuais.filter((m) => !set.has(m.chave));
}
