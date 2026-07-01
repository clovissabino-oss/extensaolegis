// @vitest-environment jsdom
// tests/core/planalto/marcadores.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extrairMarcadores, marcadoresNovos } from '../../../src/core/planalto/marcadores';
import { normalizarTexto } from '../../../src/core/planalto/normalizarTexto';

const texto = `Art. 1º ... (Redação dada pela Lei nº 9.527, de 1997)
  Art. 2º ... (Incluído pela Lei nº 11.907, de 2009)
  Art. 3º ... (Revogado pela Lei nº 13.328, de 2016)
  Art. 4º ... (Vide Decreto nº 1.171)  (Regulamento)`;

describe('extrairMarcadores', () => {
  it('captura apenas marcadores que nomeiam a norma alteradora', () => {
    const ms = extrairMarcadores(texto);
    const normas = ms.map((m) => m.norma);
    expect(normas).toContain('Lei nº 9.527, de 1997');
    expect(normas).toContain('Lei nº 11.907, de 2009');
    expect(normas).toContain('Lei nº 13.328, de 2016');
    // "Vide" e "Regulamento" não são alterações
    expect(ms.some((m) => /Vide|Regulamento/.test(m.norma))).toBe(false);
  });
  it('gera chave canônica estável e sem duplicar', () => {
    const ms = extrairMarcadores('(Redação dada pela Lei nº 1, de 2020) (Redação dada pela Lei nº 1, de 2020)');
    expect(ms).toHaveLength(1);
  });
});

describe('marcadoresNovos', () => {
  it('retorna só os marcadores ausentes do conjunto anterior', () => {
    const atuais = extrairMarcadores(texto);
    const anteriores = atuais.slice(1).map((m) => m.chave); // omite o primeiro
    const novos = marcadoresNovos(anteriores, atuais);
    expect(novos).toHaveLength(1);
    expect(novos[0].norma).toBe('Lei nº 9.527, de 1997');
  });
});

it('extrai dezenas de marcadores reais da Lei 8.112', () => {
  const buf = readFileSync(resolve(__dirname, '../../fixtures/planalto-l8112cons.html'));
  const html = new TextDecoder('iso-8859-1').decode(buf);
  const ms = extrairMarcadores(normalizarTexto(html));
  expect(ms.length).toBeGreaterThan(10);
});
