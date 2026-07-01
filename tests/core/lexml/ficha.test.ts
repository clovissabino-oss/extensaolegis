import { describe, it, expect } from 'vitest';
import { extrairUrlPlanalto } from '../../../src/core/lexml/ficha';

describe('extrairUrlPlanalto', () => {
  it('extrai o primeiro link ccivil_03 do Planalto quando presente', () => {
    const html = `<a href="https://www.planalto.gov.br/ccivil_03/leis/l8112cons.htm">texto</a>`;
    expect(extrairUrlPlanalto(html)).toBe('https://www.planalto.gov.br/ccivil_03/leis/l8112cons.htm');
  });
  it('retorna null quando não há link do Planalto', () => {
    expect(extrairUrlPlanalto('<a href="https://exemplo.com">x</a>')).toBeNull();
  });
  it('normaliza http para https', () => {
    const html = `<a href="http://www.planalto.gov.br/ccivil_03/decreto/d9991.htm">x</a>`;
    expect(extrairUrlPlanalto(html)).toBe('https://www.planalto.gov.br/ccivil_03/decreto/d9991.htm');
  });
});
