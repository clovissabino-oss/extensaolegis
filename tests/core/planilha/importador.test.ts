// tests/core/planilha/importador.test.ts
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { detectarColunas, importarPlanilha, type MapaColunas } from '../../../src/core/planilha/importador';

function planilhaBuffer(linhas: Record<string, unknown>[]): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plan1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

describe('detectarColunas', () => {
  it('mapeia cabeçalhos comuns independentemente de acento/caixa', () => {
    const mapa = detectarColunas(['Tipo', 'Número', 'ANO', 'Apelido', 'URL Planalto']);
    expect(mapa.tipo).toBe('Tipo');
    expect(mapa.numero).toBe('Número');
    expect(mapa.ano).toBe('ANO');
  });
});

describe('importarPlanilha', () => {
  const mapa: MapaColunas = { tipo: 'Tipo', numero: 'Numero', ano: 'Ano', apelido: 'Apelido' };

  it('converte linhas válidas em NormaImportada normalizada', () => {
    const buf = planilhaBuffer([{ Tipo: 'Lei', Numero: '8.112', Ano: 1990, Apelido: 'RJU' }]);
    const { normas, erros } = importarPlanilha(buf, mapa);
    expect(erros).toHaveLength(0);
    expect(normas[0]).toMatchObject({ tipo: 'Lei', numero: '8112', ano: 1990, apelido: 'RJU', linha: 2 });
  });

  it('reporta erro em linha incompleta sem travar as demais', () => {
    const buf = planilhaBuffer([
      { Tipo: 'Lei', Numero: '8.112', Ano: 1990 },
      { Tipo: 'portaria', Numero: '', Ano: 'xx' },
    ]);
    const { normas, erros } = importarPlanilha(buf, mapa);
    expect(normas).toHaveLength(1);
    expect(erros[0].linha).toBe(3);
    expect(erros[0].motivo).toMatch(/tipo|número|ano/i);
  });
});
