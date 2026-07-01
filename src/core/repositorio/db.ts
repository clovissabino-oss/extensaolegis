// src/core/repositorio/db.ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LeiAcompanhada, FotoTexto, Inovacao } from '../types';

interface LegisSchema extends DBSchema {
  leis: { key: string; value: LeiAcompanhada };
  fotos: { key: string; value: FotoTexto };
  inovacoes: { key: string; value: Inovacao; indexes: { 'por-lei': string; 'por-lida': string } };
}
export type LegisDB = IDBPDatabase<LegisSchema>;

export function abrirDb(): Promise<LegisDB> {
  return openDB<LegisSchema>('legis-monitor', 1, {
    upgrade(db) {
      db.createObjectStore('leis', { keyPath: 'id' });
      db.createObjectStore('fotos', { keyPath: 'leiId' });
      const inv = db.createObjectStore('inovacoes', { keyPath: 'id' });
      inv.createIndex('por-lei', 'leiId');
      inv.createIndex('por-lida', 'lida');
    },
  });
}

export const salvarLei = (db: LegisDB, lei: LeiAcompanhada) => db.put('leis', lei).then(() => undefined);
export const listarLeis = (db: LegisDB) => db.getAll('leis');
export const removerLei = (db: LegisDB, id: string) => db.delete('leis', id);

export const salvarFoto = (db: LegisDB, foto: FotoTexto) => db.put('fotos', foto).then(() => undefined);
export const obterFoto = (db: LegisDB, leiId: string) => db.get('fotos', leiId);

export async function salvarInovacoes(db: LegisDB, inovacoes: Inovacao[]): Promise<void> {
  const tx = db.transaction('inovacoes', 'readwrite');
  await Promise.all(inovacoes.map((i) => tx.store.put(i)));
  await tx.done;
}
export function listarInovacoes(db: LegisDB, leiId?: string): Promise<Inovacao[]> {
  return leiId ? db.getAllFromIndex('inovacoes', 'por-lei', leiId) : db.getAll('inovacoes');
}
export async function marcarLida(db: LegisDB, id: string): Promise<void> {
  const inv = await db.get('inovacoes', id);
  if (inv) await db.put('inovacoes', { ...inv, lida: true });
}
export async function contarNaoLidas(db: LegisDB): Promise<number> {
  return (await db.getAll('inovacoes')).filter((i) => !i.lida).length;
}
