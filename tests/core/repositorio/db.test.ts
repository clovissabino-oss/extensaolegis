// tests/core/repositorio/db.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  abrirDb, salvarLei, listarLeis, salvarFoto, obterFoto,
  salvarInovacoes, listarInovacoes, marcarLida, contarNaoLidas,
} from '../../../src/core/repositorio/db';
import type { LeiAcompanhada, Inovacao } from '../../../src/core/types';

const lei: LeiAcompanhada = {
  id: 'urn:lex:br:federal:lei:1990-12-11;8112', tipo: 'Lei', numero: '8112', ano: 1990,
  titulo: 'Lei nº 8112/1990', status: 'ativa', adicionadaEm: '2026-07-01T00:00:00Z',
};

describe('repositorio', () => {
  beforeEach(() => { indexedDB = new IDBFactory(); });

  it('salva e lista leis', async () => {
    const db = await abrirDb();
    await salvarLei(db, lei);
    expect((await listarLeis(db))[0].id).toBe(lei.id);
  });

  it('guarda e recupera foto por leiId', async () => {
    const db = await abrirDb();
    await salvarFoto(db, { leiId: lei.id, capturadaEm: '2026-07-01T00:00:00Z', hash: 'x', textoNorm: 't', marcadores: [], tamanho: 1 });
    expect((await obterFoto(db, lei.id))?.hash).toBe('x');
  });

  it('salva inovações, conta não lidas e marca como lida', async () => {
    const db = await abrirDb();
    const inv: Inovacao = { id: 'inv_1', leiId: lei.id, tipo: 'TEXTO', detectadaEm: '2026-07-01T00:00:00Z', lida: false };
    await salvarInovacoes(db, [inv]);
    expect(await contarNaoLidas(db)).toBe(1);
    await marcarLida(db, 'inv_1');
    expect(await contarNaoLidas(db)).toBe(0);
    expect((await listarInovacoes(db, lei.id))).toHaveLength(1);
  });
});
