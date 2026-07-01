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
  const comQuebra = (s: string) => (s.endsWith('\n') ? s : s + '\n');
  const partes = diffLines(comQuebra(anterior), comQuebra(atual));
  let add = 0, rem = 0;
  const adicionados: string[] = [];
  for (const p of partes) {
    const linhas = p.value.split('\n').filter((l) => l !== '').length;
    if (p.added) { add += linhas; adicionados.push(p.value); }
    else if (p.removed) { rem += linhas; }
  }
  const preview = adicionados.join(' ').replace(/\s+/g, ' ').trim().slice(0, 280);
  return { trechosAdicionados: add, trechosRemovidos: rem, preview };
}
