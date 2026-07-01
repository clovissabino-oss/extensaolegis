export async function buscarTextoCompilado(url: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const resp = await fetchFn(url);
  if (!resp.ok) throw new Error(`Falha ao buscar texto compilado: HTTP ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  // O texto compilado do Planalto é ISO-8859-1, mas algumas páginas gov são UTF-8.
  // Tenta UTF-8 estrito; se os bytes não forem UTF-8 válido, decodifica como ISO-8859-1.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('iso-8859-1').decode(buffer);
  }
}
