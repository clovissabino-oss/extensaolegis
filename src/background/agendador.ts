// src/background/agendador.ts
import type { LegisDB } from '../core/repositorio/db';
import { listarLeis, salvarLei, salvarFoto, obterFoto, salvarInovacoes, contarNaoLidas } from '../core/repositorio/db';
import { verificarLei } from '../core/monitor/verificar';

export function periodoEmMinutos(freq: 'horaria' | 'diaria' | 'semanal'): number {
  return { horaria: 60, diaria: 1440, semanal: 10080 }[freq];
}

interface DepsCiclo { fetchFn?: typeof fetch; agora: () => string; gerarId: () => string }

export async function executarCiclo(db: LegisDB, deps: DepsCiclo): Promise<{ totalInovacoes: number; naoLidas: number }> {
  const leis = (await listarLeis(db)).filter((l) => l.status === 'ativa');
  let total = 0;
  for (const lei of leis) {
    const fotoAnterior = (await obterFoto(db, lei.id)) ?? null;
    const r = await verificarLei(lei, fotoAnterior, { fetchFn: deps.fetchFn, agora: deps.agora(), gerarId: deps.gerarId });
    if (r.novaFoto) await salvarFoto(db, r.novaFoto);
    if (r.inovacoes.length > 0) { await salvarInovacoes(db, r.inovacoes); total += r.inovacoes.length; }
    await salvarLei(db, { ...lei, ultimaVerif: deps.agora(), ultimoStatusVerif: r.statusVerif });
  }
  return { totalInovacoes: total, naoLidas: await contarNaoLidas(db) };
}
