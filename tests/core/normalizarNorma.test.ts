import { describe, it, expect } from 'vitest';
import { normalizarTipo, normalizarNumero, normalizarAno } from '../../src/core/normalizarNorma';

describe('normalizarNumero', () => {
  it('remove pontos, espaços e prefixo nº', () => {
    expect(normalizarNumero('8.112')).toBe('8112');
    expect(normalizarNumero('nº 8.112')).toBe('8112');
    expect(normalizarNumero(' 8112 ')).toBe('8112');
  });
});

describe('normalizarTipo', () => {
  it('reconhece nomes por extenso e abreviações', () => {
    expect(normalizarTipo('Lei')).toBe('Lei');
    expect(normalizarTipo('LC')).toBe('Lei Complementar');
    expect(normalizarTipo('lei complementar')).toBe('Lei Complementar');
    expect(normalizarTipo('MP')).toBe('Medida Provisória');
    expect(normalizarTipo('EC')).toBe('Emenda Constitucional');
    expect(normalizarTipo('Dec.')).toBe('Decreto');
  });
  it('retorna null para tipo desconhecido', () => {
    expect(normalizarTipo('portaria')).toBeNull();
  });
});

describe('normalizarAno', () => {
  it('aceita número e string', () => {
    expect(normalizarAno('1990')).toBe(1990);
    expect(normalizarAno(1990)).toBe(1990);
  });
  it('rejeita anos implausíveis', () => {
    expect(normalizarAno('90')).toBeNull();
    expect(normalizarAno('abc')).toBeNull();
  });
});
