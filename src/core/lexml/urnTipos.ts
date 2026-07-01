// src/core/lexml/urnTipos.ts
import type { TipoNorma } from '../types';

export const SEGMENTO_URN: Record<TipoNorma, string> = {
  'Lei': 'lei',
  'Lei Complementar': 'lei.complementar',
  'Decreto': 'decreto',
  'Decreto-Lei': 'decreto.lei',
  'Medida Provisória': 'medida.provisoria',
  'Emenda Constitucional': 'emenda.constitucional',
  'Constituição': 'constituicao',
};
