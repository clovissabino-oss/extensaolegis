// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { periodoEmMinutos, executarCiclo } from '../../../src/background/agendador';
import { abrirDb, salvarLei, listarInovacoes, obterFoto } from '../../../src/core/repositorio/db';
import type { LeiAcompanhada } from '../../../src/core/types';

const lei: LeiAcompanhada = {
  id: 'urn:1', tipo: 'Lei', numero: '8112', ano: 1990, titulo: 'Lei 8112', status: 'ativa',
  adicionadaEm: '2026-07-01T00:00:00Z', urlPlanalto: 'https://www.planalto.gov.br/x.htm',
};

describe('periodoEmMinutos', () => {
  it('converte frequência em minutos', () => {
    expect(periodoEmMinutos('diaria')).toBe(1440);
    expect(periodoEmMinutos('horaria')).toBe(60);
  });
});

describe('executarCiclo', () => {
  beforeEach(() => { indexedDB = new IDBFactory(); });
  it('primeira execução cria foto e não gera inovação; segunda detecta', async () => {
    const db = await abrirDb();
    await salvarLei(db, lei);
    const html1 = '<p>Art. 1º base</p>';
    const html2 = '<p>Art. 1º base (Incluído pela Lei nº 10, de 2020)</p>';
    let atual = html1;
    const deps = {
      fetchFn: vi.fn(async () => new Response(new TextEncoder().encode(atual), { status: 200 })),
      agora: () => '2026-07-02T00:00:00Z',
      gerarId: (() => { let n = 0; return () => `inv_${++n}`; })(),
    };
    const r1 = await executarCiclo(db, deps);
    expect(r1.totalInovacoes).toBe(0);
    expect(await obterFoto(db, 'urn:1')).not.toBeUndefined();
    atual = html2;
    const r2 = await executarCiclo(db, deps);
    expect(r2.totalInovacoes).toBeGreaterThanOrEqual(1);
    expect((await listarInovacoes(db, 'urn:1')).length).toBeGreaterThanOrEqual(1);
  });
});
