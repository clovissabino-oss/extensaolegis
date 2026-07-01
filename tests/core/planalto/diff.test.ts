import { describe, it, expect } from 'vitest';
import { hashTexto, resumirDiff } from '../../../src/core/planalto/diff';

describe('hashTexto', () => {
  it('é estável e muda quando o texto muda', async () => {
    const a = await hashTexto('abc');
    expect(a).toBe(await hashTexto('abc'));
    expect(a).not.toBe(await hashTexto('abd'));
    expect(a).toHaveLength(64);
  });
});

describe('resumirDiff', () => {
  it('conta trechos adicionados e removidos', () => {
    const r = resumirDiff('linha1\nlinha2', 'linha1\nlinha2\nlinha3');
    expect(r.trechosAdicionados).toBe(1);
    expect(r.trechosRemovidos).toBe(0);
    expect(r.preview).toContain('linha3');
  });
});
