// @vitest-environment jsdom
// tests/core/monitor/verificar.test.ts
import { describe, it, expect, vi } from 'vitest';
import { verificarLei } from '../../../src/core/monitor/verificar';
import type { LeiAcompanhada, FotoTexto } from '../../../src/core/types';

const lei: LeiAcompanhada = {
  id: 'urn:1', tipo: 'Lei', numero: '8112', ano: 1990, titulo: 'Lei 8112', status: 'ativa',
  adicionadaEm: '2026-07-01T00:00:00Z', urlPlanalto: 'https://www.planalto.gov.br/x.htm',
};
const deps = (html: string) => ({
  fetchFn: vi.fn(async () => new Response(new TextEncoder().encode(html), { status: 200 })),
  agora: '2026-07-02T00:00:00Z',
  gerarId: (() => { let n = 0; return () => `inv_${++n}`; })(),
});

describe('verificarLei', () => {
  it('sem foto anterior: cria foto inicial e não gera inovação', async () => {
    const r = await verificarLei(lei, null, deps('<p>Art. 1º texto (Redação dada pela Lei nº 9, de 1997)</p>'));
    expect(r.statusVerif).toBe('ok');
    expect(r.inovacoes).toHaveLength(0);
    expect(r.novaFoto?.marcadores).toContain('REDACAO|lei nº 9, de 1997');
  });

  it('detecta marcador novo e mudança de texto', async () => {
    const anterior: FotoTexto = {
      leiId: 'urn:1', capturadaEm: '2026-07-01T00:00:00Z',
      hash: 'antigo', textoNorm: 'Art. 1º texto', marcadores: [], tamanho: 13,
    };
    const r = await verificarLei(lei, anterior, deps('<p>Art. 1º texto novo (Incluído pela Lei nº 10, de 2020)</p>'));
    const tipos = r.inovacoes.map((i) => i.tipo);
    expect(tipos).toContain('ALTERACAO');
    expect(tipos).toContain('TEXTO');
    expect(r.novaFoto).not.toBeNull();
  });

  it('lei sem urlPlanalto retorna sem_url', async () => {
    const semUrl = { ...lei, urlPlanalto: undefined };
    const r = await verificarLei(semUrl, null, deps('x'));
    expect(r.statusVerif).toBe('sem_url');
    expect(r.novaFoto).toBeNull();
  });

  it('falha de rede retorna falhou e preserva foto anterior', async () => {
    const d = { agora: '2026-07-02T00:00:00Z', gerarId: () => 'inv_x',
      fetchFn: vi.fn(async () => { throw new Error('rede'); }) };
    const r = await verificarLei(lei, null, d);
    expect(r.statusVerif).toBe('falhou');
    expect(r.inovacoes).toHaveLength(0);
  });

  it('guarda anti-falso-positivo: texto minúsculo com foto anterior grande retorna falhou sem inovação', async () => {
    const fotoGrande = {
      leiId: 'urn:1', capturadaEm: '2026-07-01T00:00:00Z',
      hash: 'antigo', textoNorm: 'x'.repeat(5000), marcadores: [], tamanho: 5000,
    };
    // resposta minúscula -> normalizarTexto produz < 200 chars
    const r = await verificarLei(lei, fotoGrande, deps('<p>ok</p>'));
    expect(r.statusVerif).toBe('falhou');
    expect(r.inovacoes).toHaveLength(0);
    expect(r.novaFoto).toBeNull();
  });
});
