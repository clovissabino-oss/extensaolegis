import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { montarLinhas, gerarExcel } from '../../../src/core/exportador/excel';
import type { LeiAcompanhada, Inovacao } from '../../../src/core/types';

const lei: LeiAcompanhada = { id: 'urn:1', tipo: 'Lei', numero: '8112', ano: 1990, titulo: 'Lei 8112', apelido: 'RJU', status: 'ativa', adicionadaEm: '2026-07-01T00:00:00Z' };
const inov: Inovacao = { id: 'inv_1', leiId: 'urn:1', tipo: 'ALTERACAO', detectadaEm: '2026-07-02T00:00:00Z', lida: false, normaAlteradora: { descricao: 'Lei nº 10, de 2020', tipoMarcador: 'INCLUSAO' } };

describe('exportador excel', () => {
  it('monta linhas legíveis usando o apelido da lei', () => {
    const linhas = montarLinhas([lei], [inov]);
    expect(linhas[0]).toMatchObject({ lei: 'RJU', tipo: 'ALTERACAO', descricao: 'Lei nº 10, de 2020' });
  });
  it('gera um xlsx relegível com o cabeçalho esperado', () => {
    const bytes = gerarExcel(montarLinhas([lei], [inov]));
    const wb = XLSX.read(bytes, { type: 'array' });
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    expect(Object.keys(linhas[0])).toEqual(['Lei', 'Tipo', 'Detectada em', 'Descrição']);
  });
});
