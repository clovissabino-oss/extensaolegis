// scripts/diagnostico-planilha.ts — diagnóstico temporário: resolve a planilha
// do usuário fora da extensão, mostrando o MOTIVO de cada falha.
// Uso: npx vite-node -c scripts/vite-node.config.ts scripts/diagnostico-planilha.ts -- <caminho.xlsx>
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { detectarColunas, importarPlanilha, type MapaColunas } from '../src/core/planilha/importador';
import { resolverNorma } from '../src/core/lexml/resolvedor';

const caminho = process.argv[process.argv.length - 1];
const buffer = readFileSync(caminho);
const wb = XLSX.read(buffer, { type: 'buffer' });
const cab = (XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0] ?? []) as string[];
console.log('Cabeçalho:', cab);
const mapa = detectarColunas(cab) as MapaColunas;
const { normas, erros } = importarPlanilha(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), mapa);
console.log(`${normas.length} norma(s) importadas, ${erros.length} erro(s):`, erros);

let ok = 0, falha = 0;
const falhas: { norma: string; motivo?: string }[] = [];
for (let i = 0; i < normas.length; i++) {
  const n = normas[i];
  const r = await resolverNorma(n);
  const id = `${n.tipo} ${n.numero}/${n.ano}`;
  if (r.status === 'confirmada') { ok++; console.log(`${i + 1}. ${id} → confirmada`); }
  else { falha++; falhas.push({ norma: id, motivo: r.motivo }); console.log(`${i + 1}. ${id} → ${r.status} [${r.motivo}]`); }
  await new Promise((res) => setTimeout(res, 300)); // mesmo intervalo do popup
}
console.log(`\nTotal: ${ok} confirmadas, ${falha} falhas.`);

// Re-tenta as falhas com pausa maior, para ver se é intermitência/limite do LexML.
if (falhas.length) {
  console.log('\nRe-tentando falhas com pausa de 2s…');
  for (const f of falhas) {
    const [tipoNum, ano] = f.norma.split('/');
    const partes = tipoNum.split(' ');
    const numero = partes.pop()!;
    const tipo = partes.join(' ') as import('../src/core/types').TipoNorma;
    await new Promise((res) => setTimeout(res, 2000));
    const r = await resolverNorma({ tipo, numero, ano: parseInt(ano, 10), linha: 0 });
    console.log(`retry ${f.norma} → ${r.status}${r.status !== 'confirmada' ? ` [${r.motivo}]` : ''}`);
  }
}
