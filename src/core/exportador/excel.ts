import * as XLSX from 'xlsx';
import type { LeiAcompanhada, Inovacao } from '../types';

export interface LinhaRelatorio { lei: string; tipo: string; detectadaEm: string; descricao: string }

function descricaoInovacao(i: Inovacao): string {
  if (i.tipo === 'ALTERACAO') return i.normaAlteradora?.descricao ?? '(alteração)';
  return i.resumoDiff?.preview || '(mudança de redação)';
}

export function montarLinhas(leis: LeiAcompanhada[], inovacoes: Inovacao[]): LinhaRelatorio[] {
  const nome = new Map(leis.map((l) => [l.id, l.apelido || l.titulo]));
  return inovacoes.map((i) => ({
    lei: nome.get(i.leiId) ?? i.leiId,
    tipo: i.tipo,
    detectadaEm: i.detectadaEm,
    descricao: descricaoInovacao(i),
  }));
}

export function gerarExcel(linhas: LinhaRelatorio[]): Uint8Array {
  const dados = linhas.map((l) => ({ 'Lei': l.lei, 'Tipo': l.tipo, 'Detectada em': l.detectadaEm, 'Descrição': l.descricao }));
  const ws = XLSX.utils.json_to_sheet(dados, { header: ['Lei', 'Tipo', 'Detectada em', 'Descrição'] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inovações');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
