// scripts/demo-abuso.ts — demo temporária: pipeline real com a Lei 13.869/2019.
// Simula o cenário "lei cadastrada na publicação (2019)" e computa, com o código
// real do monitor, as inovações que o painel mostraria hoje. Uso: npx vite-node scripts/demo-abuso.ts
import { JSDOM } from 'jsdom';
globalThis.DOMParser = new JSDOM().window.DOMParser as unknown as typeof DOMParser;

import { resolverNorma } from '../src/core/lexml/resolvedor';
import { verificarLei } from '../src/core/monitor/verificar';
import type { LeiAcompanhada, NormaImportada } from '../src/core/types';
import { writeFileSync } from 'node:fs';

// O Planalto rejeita o user-agent do Node; no navegador (extensão real) isso não ocorre.
const fetchNavegador: typeof fetch = (url, init) =>
  fetch(url, { ...init, headers: { ...init?.headers, 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' } });

const norma: NormaImportada = { tipo: 'Lei', numero: '13869', ano: 2019, apelido: 'Lei de Abuso de Autoridade', linha: 1 };

const res = await resolverNorma(norma, fetchNavegador);
console.log('Resolução LexML:', res.status, res.candidatos.map((c) => c.urn));
if (res.status !== 'confirmada') { console.log('motivo:', res.motivo); process.exit(1); }

const urn = res.candidatos[0].urn;
// A ficha LexML desta lei não expõe o link ccivil_03; na planilha real, a coluna
// urlPlanalto cobre esse caso. URL oficial do texto compilado:
const urlPlanalto = 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/lei/l13869.htm';

const lei: LeiAcompanhada = {
  id: urn, tipo: norma.tipo, numero: norma.numero, ano: norma.ano,
  titulo: res.candidatos[0].titulo, apelido: norma.apelido, urlPlanalto,
  status: 'ativa', adicionadaEm: '2019-09-05T12:00:00.000Z', ultimaVerif: new Date().toISOString(), ultimoStatusVerif: 'ok',
};

// 1ª verificação real (baseline de hoje).
let seq = 0;
const gerarId = () => `demo-${++seq}`;
const hoje = await verificarLei(lei, null, { agora: new Date().toISOString(), gerarId, fetchFn: fetchNavegador });
if (!hoje.novaFoto) { console.log('verificação falhou:', hoje.statusVerif); process.exit(1); }
console.log(`Texto compilado: ${hoje.novaFoto.tamanho} caracteres, ${hoje.novaFoto.marcadores.length} marcadores.`);
console.log(hoje.novaFoto.marcadores);

// Simula a foto que existiria se a lei tivesse sido cadastrada em 2019:
// remove dos marcadores conhecidos os que citam normas posteriores a 2019.
const marcadoresAntigos = hoje.novaFoto.marcadores.filter((chave) => {
  const anos = [...chave.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => parseInt(m[0], 10));
  return anos.length === 0 || Math.max(...anos) <= 2019;
});
// Mantém o hash atual: o diff de texto não é reproduzível sem a foto de 2019,
// então a demo mostra apenas as inovações de marcador (ALTERACAO), que são reais.
const fotoAntiga = { ...hoje.novaFoto, capturadaEm: '2019-09-05T12:00:00.000Z', marcadores: marcadoresAntigos };

// 2ª verificação real contra a foto "de 2019" → inovações que o painel mostraria.
const agora = await verificarLei(lei, fotoAntiga, { agora: new Date().toISOString(), gerarId, fetchFn: fetchNavegador });
console.log(`Inovações detectadas: ${agora.inovacoes.length}`);
for (const i of agora.inovacoes) console.log('-', i.tipo, i.normaAlteradora?.descricao ?? i.resumoDiff?.preview?.slice(0, 80));

writeFileSync('scripts/demo-abuso.json', JSON.stringify({ lei, inovacoes: agora.inovacoes }, null, 2), 'utf8');
console.log('Gravado em scripts/demo-abuso.json');
