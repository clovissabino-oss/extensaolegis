// tests/core/lexml/resolvedor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { segmentoUrn, resolverNorma } from '../../../src/core/lexml/resolvedor';
import type { NormaImportada } from '../../../src/core/types';

const htmlBusca = readFileSync(resolve(__dirname, '../../fixtures/lexml-search-8112.html'), 'utf-8');
const fetchMock = (html: string) =>
  vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }));

const lei8112: NormaImportada = { tipo: 'Lei', numero: '8112', ano: 1990, linha: 2 };

describe('segmentoUrn', () => {
  it('mapeia TipoNorma para o segmento da URN', () => {
    expect(segmentoUrn('Lei')).toBe('lei');
    expect(segmentoUrn('Lei Complementar')).toBe('lei.complementar');
    expect(segmentoUrn('Medida Provisória')).toBe('medida.provisoria');
  });
});

describe('resolverNorma', () => {
  it('confirma quando há exatamente um resultado federal correspondente', async () => {
    const r = await resolverNorma(lei8112, fetchMock(htmlBusca));
    expect(r.status).toBe('confirmada');
    expect(r.candidatos[0].urn).toBe('urn:lex:br:federal:lei:1990-12-11;8112');
  });

  it('retorna nao_localizada quando não há correspondência', async () => {
    const r = await resolverNorma({ tipo: 'Lei', numero: '999999', ano: 1990, linha: 3 }, fetchMock(htmlBusca));
    expect(r.status).toBe('nao_localizada');
    expect(r.candidatos).toHaveLength(0);
  });

  it('filtra por ano e confirma quando dois URNs com o mesmo número diferem apenas no ano', async () => {
    const html = `<a href="/urn/urn:lex:br:federal:lei:1990-12-11;8112">A</a>
                  <a href="/urn/urn:lex:br:federal:lei:1991-01-10;8112">B</a>`;
    const r = await resolverNorma({ tipo: 'Lei', numero: '8112', ano: 1990, linha: 4 }, fetchMock(html));
    // ano 1990 filtra para 1 -> confirmada
    expect(r.status).toBe('confirmada');
  });

  it('marca ambigua quando dois URNs distintos compartilham segmento, número e ano', async () => {
    const html = `<a href="/urn/urn:lex:br:federal:lei:1990-12-11;8112">A</a>
                  <a href="/urn/urn:lex:br:federal:lei:1990-06-01;8112">B</a>`;
    const r = await resolverNorma({ tipo: 'Lei', numero: '8112', ano: 1990, linha: 5 }, fetchMock(html));
    expect(r.status).toBe('ambigua');
    expect(r.candidatos).toHaveLength(2);
  });

  it('retorna nao_localizada com motivo HTTP quando a resposta é 404', async () => {
    const fetch404 = vi.fn(async () => new Response('', { status: 404 }));
    const r = await resolverNorma({ tipo: 'Lei', numero: '8112', ano: 1990, linha: 6 }, fetch404);
    expect(r.status).toBe('nao_localizada');
    expect(r.motivo).toMatch(/404/);
  });

  it('retorna nao_localizada e não lança quando fetchFn rejeita com erro de rede', async () => {
    const fetchErro = vi.fn(async () => { throw new Error('rede'); });
    const r = await resolverNorma({ tipo: 'Lei', numero: '8112', ano: 1990, linha: 7 }, fetchErro);
    expect(r.status).toBe('nao_localizada');
  });
});
