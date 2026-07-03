// src/core/types.ts
export type TipoNorma =
  | 'Lei'
  | 'Lei Complementar'
  | 'Decreto'
  | 'Decreto-Lei'
  | 'Medida Provisória'
  | 'Emenda Constitucional'
  | 'Constituição';

export interface NormaImportada {
  tipo: TipoNorma;
  numero: string;        // normalizado sem pontuação: "8112"
  ano: number;
  apelido?: string;
  urlPlanalto?: string;
  observacao?: string;
  linha: number;         // linha de origem na planilha (1-based)
}

// 'falha' = erro transitório de consulta (HTTP 5xx, rede); diferente de
// 'nao_localizada', que significa busca bem-sucedida sem correspondência.
export type StatusResolucao = 'confirmada' | 'ambigua' | 'nao_localizada' | 'falha';

export interface CandidatoNorma {
  urn: string;
  titulo: string;
  urlLexml: string;
}

export interface ResultadoResolucao {
  norma: NormaImportada;
  status: StatusResolucao;
  candidatos: CandidatoNorma[];   // 1 = confirmada; >1 = ambígua; 0 = não localizada
  motivo?: string;
}

export interface LeiAcompanhada {
  id: string;            // URN canônica (chave)
  tipo: TipoNorma;
  numero: string;
  ano: number;
  titulo: string;
  apelido?: string;
  urlPlanalto?: string;
  status: 'ativa' | 'pausada';
  adicionadaEm: string;  // ISO
  ultimaVerif?: string;  // ISO
  ultimoStatusVerif?: 'ok' | 'falhou' | 'sem_url';
}

export interface FotoTexto {
  leiId: string;
  capturadaEm: string;   // ISO
  hash: string;          // hex SHA-256
  textoNorm: string;
  marcadores: string[];  // marcadores já conhecidos (chaves canônicas)
  tamanho: number;
}

export type TipoInovacao = 'ALTERACAO' | 'TEXTO';

export interface Inovacao {
  id: string;
  leiId: string;
  tipo: TipoInovacao;
  detectadaEm: string;   // ISO
  lida: boolean;
  normaAlteradora?: { descricao: string; tipoMarcador: string };
  resumoDiff?: { trechosAdicionados: number; trechosRemovidos: number; preview: string };
}
