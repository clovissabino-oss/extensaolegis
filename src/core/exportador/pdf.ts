import { jsPDF } from 'jspdf';
import type { LinhaRelatorio } from './excel';

export function gerarPdf(linhas: LinhaRelatorio[]): Blob {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('Relatório de Inovações — Legis Monitor', 14, 16);
  doc.setFontSize(9);
  let y = 28;
  for (const l of linhas) {
    const txt = `${l.detectadaEm.slice(0, 10)}  [${l.tipo}]  ${l.lei}: ${l.descricao}`;
    for (const linha of doc.splitTextToSize(txt, 180) as string[]) {
      if (y > 285) { doc.addPage(); y = 16; }
      doc.text(linha, 14, y); y += 6;
    }
  }
  return doc.output('blob');
}
