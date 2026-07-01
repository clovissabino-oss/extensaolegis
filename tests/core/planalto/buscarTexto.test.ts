import { describe, it, expect, vi } from 'vitest';
import { buscarTextoCompilado } from '../../../src/core/planalto/buscarTexto';

describe('buscarTextoCompilado', () => {
  it('decodifica bytes ISO-8859-1 corretamente (ç, ã, º)', async () => {
    // "Redação nº" em ISO-8859-1
    const bytes = new Uint8Array([0x52, 0x65, 0x64, 0x61, 0xE7, 0xE3, 0x6F, 0x20, 0x6E, 0xBA]);
    const fetchFn = vi.fn(async () => new Response(bytes, { status: 200 }));
    const txt = await buscarTextoCompilado('https://www.planalto.gov.br/x.htm', fetchFn);
    expect(txt).toBe('Redação nº');
  });

  it('lança erro em resposta não-ok', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 404 }));
    await expect(buscarTextoCompilado('https://www.planalto.gov.br/x.htm', fetchFn)).rejects.toThrow(/404/);
  });
});
