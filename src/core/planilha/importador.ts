// src/core/planilha/importador.ts
import * as XLSX from 'xlsx';
import type { NormaImportada } from '../types';
import { normalizarTipo, normalizarNumero, normalizarAno } from '../normalizarNorma';

export type MapaColunas = {
  tipo: string; numero: string; ano: string;
  apelido?: string; urlPlanalto?: string; observacao?: string;
};

const SINONIMOS: Record<keyof MapaColunas, string[]> = {
  tipo: ['tipo', 'especie', 'espécie'],
  numero: ['numero', 'número', 'nº', 'no', 'num'],
  ano: ['ano'],
  apelido: ['apelido', 'nome', 'descricao', 'descrição', 'alcunha'],
  urlPlanalto: ['url', 'url planalto', 'link', 'link planalto', 'planalto'],
  observacao: ['observacao', 'observação', 'obs', 'nota'],
};

function chaveNorm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export function detectarColunas(cabecalho: string[]): Partial<MapaColunas> {
  const mapa: Partial<MapaColunas> = {};
  for (const campo of Object.keys(SINONIMOS) as (keyof MapaColunas)[]) {
    const alvo = SINONIMOS[campo].map(chaveNorm);
    const achado = cabecalho.find((c) => alvo.includes(chaveNorm(c)));
    if (achado) mapa[campo] = achado;
  }
  return mapa;
}

export function importarPlanilha(
  buffer: ArrayBuffer,
  mapa: MapaColunas,
): { normas: NormaImportada[]; erros: { linha: number; motivo: string }[] } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  const normas: NormaImportada[] = [];
  const erros: { linha: number; motivo: string }[] = [];

  linhas.forEach((linha, i) => {
    const numeroLinha = i + 2; // +1 cabeçalho, +1 base-1
    const tipo = normalizarTipo(String(linha[mapa.tipo] ?? ''));
    const numero = normalizarNumero(String(linha[mapa.numero] ?? ''));
    const ano = normalizarAno(String(linha[mapa.ano] ?? ''));

    const faltando: string[] = [];
    if (!tipo) faltando.push('tipo');
    if (!numero) faltando.push('número');
    if (ano === null) faltando.push('ano');
    if (faltando.length > 0) {
      erros.push({ linha: numeroLinha, motivo: `Campos inválidos/ausentes: ${faltando.join(', ')}` });
      return;
    }

    normas.push({
      tipo: tipo!, numero, ano: ano!,
      apelido: mapa.apelido ? String(linha[mapa.apelido] ?? '').trim() || undefined : undefined,
      urlPlanalto: mapa.urlPlanalto ? String(linha[mapa.urlPlanalto] ?? '').trim() || undefined : undefined,
      observacao: mapa.observacao ? String(linha[mapa.observacao] ?? '').trim() || undefined : undefined,
      linha: numeroLinha,
    });
  });

  return { normas, erros };
}
