const BASE_URN = 'https://www.lexml.gov.br/urn/';

export function extrairUrlPlanalto(htmlFicha: string): string | null {
  const m = htmlFicha.match(/https?:\/\/(?:www\.)?planalto\.gov\.br\/ccivil_03\/[^\s"'<>]+\.htm/i);
  if (!m) return null;
  return m[0].replace(/^http:\/\//i, 'https://').replace(/^https:\/\/planalto/i, 'https://www.planalto');
}

export async function buscarUrlPlanalto(urn: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const resp = await fetchFn(BASE_URN + urn);
    if (!resp.ok) return null;
    return extrairUrlPlanalto(await resp.text());
  } catch {
    return null;
  }
}
