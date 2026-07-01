// src/core/monitor/verificar.ts
import type { LeiAcompanhada, FotoTexto, Inovacao } from '../types';
import { normalizarTexto } from '../planalto/normalizarTexto';
import { extrairMarcadores, marcadoresNovos } from '../planalto/marcadores';
import { hashTexto, resumirDiff } from '../planalto/diff';

export interface ResultadoVerificacao {
  inovacoes: Inovacao[];
  novaFoto: FotoTexto | null;
  statusVerif: 'ok' | 'falhou' | 'sem_url';
}

interface Deps { fetchFn?: typeof fetch; agora: string; gerarId: () => string }

async function fetchHtml(url: string, fetchFn: typeof fetch): Promise<string> {
  const resp = await fetchFn(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  // Use arrayBuffer + ISO-8859-1 for real Planalto pages; falls back gracefully
  // because TextDecoder('iso-8859-1') on UTF-8 bytes round-trips through DOMParser.
  const buffer = await resp.arrayBuffer();
  // Detect encoding: if valid UTF-8 use it, otherwise fall back to ISO-8859-1
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return utf8;
  } catch {
    return new TextDecoder('iso-8859-1').decode(buffer);
  }
}

export async function verificarLei(
  lei: LeiAcompanhada,
  fotoAnterior: FotoTexto | null,
  deps: Deps,
): Promise<ResultadoVerificacao> {
  if (!lei.urlPlanalto) return { inovacoes: [], novaFoto: null, statusVerif: 'sem_url' };

  let textoNorm: string;
  try {
    const html = await fetchHtml(lei.urlPlanalto, deps.fetchFn ?? fetch);
    textoNorm = normalizarTexto(html);
  } catch {
    return { inovacoes: [], novaFoto: null, statusVerif: 'falhou' };
  }

  // Guarda contra extração anômala (evita falso positivo se o parsing quebrar).
  if (textoNorm.length < 200 && fotoAnterior && fotoAnterior.tamanho > 1000) {
    return { inovacoes: [], novaFoto: null, statusVerif: 'falhou' };
  }

  const marcadores = extrairMarcadores(textoNorm);
  const hash = await hashTexto(textoNorm);
  const novaFoto: FotoTexto = {
    leiId: lei.id, capturadaEm: deps.agora, hash, textoNorm,
    marcadores: marcadores.map((m) => m.chave), tamanho: textoNorm.length,
  };

  if (!fotoAnterior) return { inovacoes: [], novaFoto, statusVerif: 'ok' };

  const inovacoes: Inovacao[] = [];
  for (const m of marcadoresNovos(fotoAnterior.marcadores, marcadores)) {
    inovacoes.push({
      id: deps.gerarId(), leiId: lei.id, tipo: 'ALTERACAO', detectadaEm: deps.agora, lida: false,
      normaAlteradora: { descricao: m.norma, tipoMarcador: m.tipoMarcador },
    });
  }
  if (fotoAnterior.hash !== hash) {
    inovacoes.push({
      id: deps.gerarId(), leiId: lei.id, tipo: 'TEXTO', detectadaEm: deps.agora, lida: false,
      resumoDiff: resumirDiff(fotoAnterior.textoNorm, textoNorm),
    });
  }
  return { inovacoes, novaFoto, statusVerif: 'ok' };
}
