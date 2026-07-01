// @vitest-environment jsdom
// tests/core/planalto/normalizarTexto.test.ts
import { describe, it, expect } from 'vitest';
import { normalizarTexto } from '../../../src/core/planalto/normalizarTexto';

describe('normalizarTexto', () => {
  it('remove tags e colapsa espaços', () => {
    const html = '<p>Art. 1º   O servidor</p>\n\n<p>público   federal.</p>';
    expect(normalizarTexto(html)).toBe('Art. 1º O servidor público federal.');
  });
  it('ignora scripts e estilos', () => {
    const html = '<style>a{}</style><script>1</script><p>Texto</p>';
    expect(normalizarTexto(html)).toBe('Texto');
  });
  it('mudança trivial de espaços produz o mesmo resultado', () => {
    expect(normalizarTexto('<p>Art.  1º</p>')).toBe(normalizarTexto('<p>Art. 1º</p>'));
  });
});
