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

  it('marca ambigua quando o mesmo número aparece em anos diferentes pedidos por ano ausente', async () => {
    const html = `<a href="/urn/urn:lex:br:federal:lei:1990-12-11;8112">A</a>
                  <a href="/urn/urn:lex:br:federal:lei:1991-01-10;8112">B</a>`;
    const r = await resolverNorma({ tipo: 'Lei', numero: '8112', ano: 1990, linha: 4 }, fetchMock(html));
    // ano 1990 filtra para 1 -> confirmada
    expect(r.status).toBe('confirmada');
  });
});
