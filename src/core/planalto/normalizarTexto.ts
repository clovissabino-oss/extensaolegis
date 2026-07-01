export function normalizarTexto(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach((el) => el.remove());
  const texto = doc.body?.textContent ?? '';
  return texto.replace(/\s+/g, ' ').trim();
}
