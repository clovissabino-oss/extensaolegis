// @vitest-environment jsdom
// tests/core/ui/download.test.ts
import { describe, it, expect } from 'vitest';
import { bytesParaBlobXlsx } from '../../../src/ui/panel/download';

describe('bytesParaBlobXlsx', () => {
  it('cria um Blob com o mimetype de xlsx', () => {
    const blob = bytesParaBlobXlsx(new Uint8Array([1, 2, 3]));
    expect(blob.type).toContain('spreadsheetml');
    expect(blob.size).toBe(3);
  });
});
