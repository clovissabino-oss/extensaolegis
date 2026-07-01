import type { TipoNorma } from './types';

const MAPA_TIPO: Record<string, TipoNorma> = {
  'lei': 'Lei',
  'lei complementar': 'Lei Complementar', 'lc': 'Lei Complementar',
  'decreto': 'Decreto', 'dec': 'Decreto', 'dec.': 'Decreto',
  'decreto-lei': 'Decreto-Lei', 'decreto lei': 'Decreto-Lei', 'dl': 'Decreto-Lei',
  'medida provisoria': 'Medida Provisória', 'medida provisória': 'Medida Provisória', 'mp': 'Medida Provisória',
  'emenda constitucional': 'Emenda Constitucional', 'ec': 'Emenda Constitucional', 'emc': 'Emenda Constitucional',
  'constituicao': 'Constituição', 'constituição': 'Constituição', 'cf': 'Constituição',
};

export function normalizarNumero(bruto: string): string {
  return (bruto ?? '').toString().toLowerCase().replace(/n[ºo°.]/g, '').replace(/[.\s]/g, '').trim();
}

export function normalizarTipo(bruto: string): TipoNorma | null {
  const chave = (bruto ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  return MAPA_TIPO[chave] ?? null;
}

export function normalizarAno(bruto: string | number): number | null {
  const n = typeof bruto === 'number' ? bruto : parseInt((bruto ?? '').toString().trim(), 10);
  if (Number.isNaN(n) || n < 1800 || n > 2100) return null;
  return n;
}
