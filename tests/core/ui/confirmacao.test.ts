import { describe, it, expect, vi } from 'vitest';
import { confirmarParaLeis, resolverLote } from '../../../src/ui/popup/confirmacao';
import type { NormaImportada, ResultadoResolucao } from '../../../src/core/types';

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

const htmlComUrn = (numero: string) => `<a href="/urn/urn:lex:br:federal:lei:1990-01-01;${numero}">x</a>`;
const norma = (numero: string, linha: number): NormaImportada => ({ tipo: 'Lei', numero, ano: 1990, linha });

describe('resolverLote', () => {
  it('re-tenta automaticamente as consultas que falharam (ex.: HTTP 503 intermitente)', async () => {
    // 1ª chamada de cada norma: 503; chamadas seguintes: sucesso.
    const vistas = new Set<string>();
    const fetchInstavel = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (!vistas.has(u)) { vistas.add(u); return new Response('', { status: 503 }); }
      const numero = decodeURIComponent(u).match(/Lei (\d+) 1990/)?.[1] ?? '0';
      return new Response(htmlComUrn(numero), { status: 200 });
    });

    const res = await resolverLote([norma('8112', 2), norma('8429', 3)], {
      fetchFn: fetchInstavel as typeof fetch, esperaReconsultaMs: 1,
    });

    expect(res.map((r) => r.status)).toEqual(['confirmada', 'confirmada']);
  });

  it('mantém status falha quando o servidor segue indisponível após as re-tentativas', async () => {
    const fetch503 = vi.fn(async () => new Response('', { status: 503 }));
    const res = await resolverLote([norma('8112', 2)], { fetchFn: fetch503 as typeof fetch, esperaReconsultaMs: 1 });
    expect(res[0].status).toBe('falha');
    expect(fetch503.mock.calls.length).toBeGreaterThan(1); // re-tentou antes de desistir
  });

  it('não re-consulta normas já resolvidas na primeira passada', async () => {
    const fetchOk = vi.fn(async () => new Response(htmlComUrn('8112'), { status: 200 }));
    await resolverLote([norma('8112', 2)], { fetchFn: fetchOk as typeof fetch, esperaReconsultaMs: 1 });
    expect(fetchOk).toHaveBeenCalledTimes(1);
  });
});
