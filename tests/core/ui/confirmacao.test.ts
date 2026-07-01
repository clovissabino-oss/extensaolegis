import { describe, it, expect } from 'vitest';
import { confirmarParaLeis } from '../../../src/ui/popup/confirmacao';
import type { ResultadoResolucao } from '../../../src/core/types';

const conf: ResultadoResolucao = {
  norma: { tipo: 'Lei', numero: '8112', ano: 1990, apelido: 'RJU', linha: 2 },
  status: 'confirmada',
  candidatos: [{ urn: 'urn:lex:br:federal:lei:1990-12-11;8112', titulo: 'Lei nº 8112/1990', urlLexml: 'x' }],
};

describe('confirmarParaLeis', () => {
  it('converte confirmadas em LeiAcompanhada com a URN como id', () => {
    const leis = confirmarParaLeis([conf], {});
    expect(leis[0]).toMatchObject({ id: 'urn:lex:br:federal:lei:1990-12-11;8112', apelido: 'RJU', status: 'ativa' });
  });
  it('ignora não localizadas e ambíguas sem escolha', () => {
    const amb: ResultadoResolucao = { ...conf, status: 'ambigua', candidatos: [conf.candidatos[0], { urn: 'urn:b', titulo: 'B', urlLexml: 'y' }] };
    expect(confirmarParaLeis([amb], {})).toHaveLength(0);
  });
  it('usa a escolha do usuário para ambíguas (por índice de linha)', () => {
    const amb: ResultadoResolucao = { ...conf, status: 'ambigua', candidatos: [conf.candidatos[0], { urn: 'urn:b', titulo: 'B', urlLexml: 'y' }] };
    const leis = confirmarParaLeis([amb], { 2: 'urn:b' });
    expect(leis[0].id).toBe('urn:b');
  });
});
