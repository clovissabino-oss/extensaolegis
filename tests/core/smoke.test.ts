import { describe, it, expect } from 'vitest';
import type { NormaImportada } from '../../src/core/types';

describe('scaffolding', () => {
  it('permite construir uma NormaImportada válida', () => {
    const n: NormaImportada = { tipo: 'Lei', numero: '8112', ano: 1990, linha: 1 };
    expect(n.tipo).toBe('Lei');
  });
});
