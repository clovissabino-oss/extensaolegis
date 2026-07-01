// scripts/gerar-modelo.mjs
import * as XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';

const linhas = [
  { Tipo: 'Lei', 'Número': '8.112', Ano: 1990, Apelido: 'Regime Jurídico dos Servidores', 'URL Planalto': 'https://www.planalto.gov.br/ccivil_03/leis/l8112cons.htm', 'Observação': '' },
  { Tipo: 'Lei Complementar', 'Número': '101', Ano: 2000, Apelido: 'Responsabilidade Fiscal', 'URL Planalto': '', 'Observação': '' },
];

const ws = XLSX.utils.json_to_sheet(linhas);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Legislações');
mkdirSync('public', { recursive: true });
XLSX.writeFile(wb, 'public/modelo-legislacoes.xlsx');
console.log('modelo gerado');
