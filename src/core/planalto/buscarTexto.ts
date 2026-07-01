export async function buscarTextoCompilado(url: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const resp = await fetchFn(url);
  if (!resp.ok) throw new Error(`Falha ao buscar texto compilado: HTTP ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  return new TextDecoder('iso-8859-1').decode(buffer);
}
