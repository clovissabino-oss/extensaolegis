import { diffLines } from 'diff';

export async function hashTexto(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function resumirDiff(
  anterior: string,
  atual: string,
): { trechosAdicionados: number; trechosRemovidos: number; preview: string } {
  const partes = diffLines(anterior, atual);
  let add = 0, rem = 0;
  const adicionados: string[] = [];
  for (const p of partes) {
    if (p.added) { add += (p.value.match(/\n/g) || []).length; adicionados.push(p.value); }
    else if (p.removed) { rem += (p.value.match(/\n/g) || []).length; }
  }
  const preview = adicionados.join(' ').replace(/\s+/g, ' ').trim().slice(0, 280);
  return { trechosAdicionados: add, trechosRemovidos: rem, preview };
}
