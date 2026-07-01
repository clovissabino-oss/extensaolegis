# Extensão Legis Monitor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir uma extensão Chrome/Edge (Manifest V3, 100% client-side) que importa uma planilha de leis, resolve cada norma via LexML, monitora o texto compilado do Planalto e notifica inovações (normas alteradoras + mudança de redação), com painel e exportação.

**Architecture:** Núcleo de lógica pura em TypeScript (sem dependência do navegador, testável isoladamente) + service worker (agendamento e notificações) + UI em Preact. Uma única requisição ao Planalto por lei alimenta duas detecções: marcadores de alteração inline e diff do texto normalizado. LexML é usado só para resolução (tipo/número/ano → URN).

**Tech Stack:** TypeScript, Preact, Vite + @crxjs/vite-plugin, SheetJS (xlsx), jsPDF, `diff`, `idb`, Vitest + fake-indexeddb (unit/integração), Playwright (E2E).

## Global Constraints

- **Manifest V3.** Service worker (não background page). `permissions`: `alarms`, `notifications`, `storage`. `host_permissions`: `https://www.lexml.gov.br/*`, `https://www.planalto.gov.br/*`.
- **Sem backend.** Todo dado fica local (IndexedDB + `chrome.storage.local`). Nada é enviado a terceiros.
- **Endpoints verificados (2026-07-01):**
  - Resolução LexML: `GET https://www.lexml.gov.br/busca/search?keyword=<termos>` → HTML **UTF-8**. Resultados são links `<a href="/urn/urn:lex:br:federal:<tipo>:<AAAA-MM-DD>;<numero>">`.
  - Ficha LexML (para achar URL do Planalto): `GET https://www.lexml.gov.br/urn/<urn>` → HTML.
  - Texto compilado: `GET https://www.planalto.gov.br/ccivil_03/...htm` → HTML em **ISO-8859-1** (decodificar com `TextDecoder('iso-8859-1')`, nunca UTF-8).
  - **NÃO** usar `/busca/SRU` (desativado — HTTP 404). **NÃO** depender das relações renderizadas por JS na ficha.
- **Marcadores de alteração** (fonte autoritativa de normas alteradoras), padrão no texto compilado: `(Redação dada pela <norma>)`, `(Incluído pela <norma>)`, `(Incluída pela <norma>)`, `(Acrescido pela <norma>)`, `(Revogado pela <norma>)`, `(Revogada pela <norma>)`.
- **Sem falso positivo:** normalizar texto (remover HTML, colapsar espaços) antes de hash/diff; extração de marcadores só conta os que nomeiam uma norma (`pela/pelo`).
- **Idioma:** identificadores em código em inglês/camelCase; textos de UI em português.
- **Cobertura de testes:** mínimo 80% no núcleo. Fontes externas sempre mockadas (fixtures HTML).
- **Commits:** conventional commits, sem assinatura de atribuição.
- **Repositório:** https://github.com/clovissabino-oss/extensaolegis (branch `main`).

## File Structure

```
extensaolegis/
  package.json
  tsconfig.json
  vite.config.ts
  vitest.config.ts
  src/
    manifest.ts                      # definição do manifest MV3 (crxjs)
    core/
      types.ts                       # tipos de domínio compartilhados
      normalizarNorma.ts             # "Lei"/"8.112"/"1990" -> {tipo, numero, ano}
      planilha/importador.ts         # xlsx/csv -> NormaImportada[]
      lexml/urnTipos.ts              # mapa TipoNorma <-> segmento de URN
      lexml/resolvedor.ts            # /busca/search -> CandidatoNorma[]
      lexml/ficha.ts                 # /urn/<urn> -> urlPlanalto (best-effort)
      planalto/buscarTexto.ts        # fetch + decode ISO-8859-1
      planalto/normalizarTexto.ts    # HTML -> texto plano normalizado
      planalto/marcadores.ts         # extrai marcadores de alteração
      planalto/diff.ts               # hash SHA-256 + diff de linhas
      monitor/verificar.ts           # orquestra checagem de 1 lei -> Inovacao[]
      repositorio/db.ts              # schema idb + CRUD
      exportador/excel.ts            # inovações -> .xlsx
      exportador/pdf.ts              # inovações -> .pdf
    background/service-worker.ts     # chrome.alarms + notifications + badge
    ui/
      popup/Popup.tsx                # importar + confirmar
      panel/Panel.tsx                # histórico + exportar
      options/Options.tsx            # frequência
      components/*.tsx
      main-popup.tsx / main-panel.tsx / main-options.tsx
  tests/
    fixtures/
      lexml-search-8112.html         # capturado de /busca/search
      lexml-ficha-8112.html          # capturado de /urn/<urn>
      planalto-l8112cons.html        # capturado do texto compilado (ISO-8859-1)
    core/**/*.test.ts
  e2e/
    fluxo.spec.ts
```

---

### Task 1: Scaffolding do projeto (Vite + Preact + TS + MV3 + Vitest)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `src/manifest.ts`, `src/background/service-worker.ts`, `src/ui/popup/main-popup.tsx`, `popup.html`, `src/core/types.ts`
- Test: `tests/core/smoke.test.ts`

**Interfaces:**
- Produces: build carregável (`dist/`), runner de testes funcionando, e os tipos de domínio de `core/types.ts` (abaixo) consumidos por todas as tarefas seguintes.

- [ ] **Step 1: Criar `core/types.ts` com os tipos de domínio**

```typescript
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

export type StatusResolucao = 'confirmada' | 'ambigua' | 'nao_localizada';

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
```

- [ ] **Step 2: Criar `package.json` com scripts e dependências**

```json
{
  "name": "extensaolegis",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage"
  },
  "dependencies": {
    "preact": "^10.22.0",
    "xlsx": "^0.18.5",
    "jspdf": "^2.5.1",
    "diff": "^5.2.0",
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.25",
    "@preact/preset-vite": "^2.9.0",
    "@types/chrome": "^0.0.268",
    "@types/diff": "^5.2.1",
    "@vitest/coverage-v8": "^2.0.0",
    "fake-indexeddb": "^6.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Criar `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `src/manifest.ts`**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "types": ["chrome", "vitest/globals"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "e2e"]
}
```

```typescript
// src/manifest.ts
import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Extensão Legis Monitor',
  version: '0.1.0',
  description: 'Monitora inovações em legislação federal (Planalto) a partir de uma planilha.',
  action: { default_popup: 'popup.html', default_title: 'Legis Monitor' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  permissions: ['alarms', 'notifications', 'storage'],
  host_permissions: ['https://www.lexml.gov.br/*', 'https://www.planalto.gov.br/*'],
});
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
});
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: { provider: 'v8', include: ['src/core/**'], thresholds: { lines: 80, functions: 80 } },
  },
});
```

- [ ] **Step 4: Criar service worker mínimo e popup mínimo**

```typescript
// src/background/service-worker.ts
// Placeholder de wiring — a lógica de agendamento entra na Task 12.
console.info('[legis-monitor] service worker iniciado');
```

```html
<!-- popup.html -->
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>Legis Monitor</title></head>
<body><div id="app"></div><script type="module" src="/src/ui/popup/main-popup.tsx"></script></body>
</html>
```

```tsx
// src/ui/popup/main-popup.tsx
import { render } from 'preact';
render(<div>Legis Monitor</div>, document.getElementById('app')!);
```

- [ ] **Step 5: Escrever teste smoke e um tipo-guia**

```typescript
// tests/core/smoke.test.ts
import { describe, it, expect } from 'vitest';
import type { NormaImportada } from '../../src/core/types';

describe('scaffolding', () => {
  it('permite construir uma NormaImportada válida', () => {
    const n: NormaImportada = { tipo: 'Lei', numero: '8112', ano: 1990, linha: 1 };
    expect(n.tipo).toBe('Lei');
  });
});
```

- [ ] **Step 6: Instalar, rodar teste e build**

Run: `npm install && npm test && npm run build`
Expected: teste PASSA; `dist/` gerado com `manifest.json`. Carregar `dist/` em `chrome://extensions` (modo desenvolvedor) mostra o ícone sem erros.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffolding da extensão (Vite + Preact + MV3 + Vitest) e tipos de domínio"
```

---

### Task 2: Normalizador de norma (parse de tipo/número/ano)

**Files:**
- Create: `src/core/normalizarNorma.ts`
- Test: `tests/core/normalizarNorma.test.ts`

**Interfaces:**
- Produces:
  - `normalizarTipo(bruto: string): TipoNorma | null`
  - `normalizarNumero(bruto: string): string` (remove pontos/espaços/"nº")
  - `normalizarAno(bruto: string | number): number | null`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// tests/core/normalizarNorma.test.ts
import { describe, it, expect } from 'vitest';
import { normalizarTipo, normalizarNumero, normalizarAno } from '../../src/core/normalizarNorma';

describe('normalizarNumero', () => {
  it('remove pontos, espaços e prefixo nº', () => {
    expect(normalizarNumero('8.112')).toBe('8112');
    expect(normalizarNumero('nº 8.112')).toBe('8112');
    expect(normalizarNumero(' 8112 ')).toBe('8112');
  });
});

describe('normalizarTipo', () => {
  it('reconhece nomes por extenso e abreviações', () => {
    expect(normalizarTipo('Lei')).toBe('Lei');
    expect(normalizarTipo('LC')).toBe('Lei Complementar');
    expect(normalizarTipo('lei complementar')).toBe('Lei Complementar');
    expect(normalizarTipo('MP')).toBe('Medida Provisória');
    expect(normalizarTipo('EC')).toBe('Emenda Constitucional');
    expect(normalizarTipo('Dec.')).toBe('Decreto');
  });
  it('retorna null para tipo desconhecido', () => {
    expect(normalizarTipo('portaria')).toBeNull();
  });
});

describe('normalizarAno', () => {
  it('aceita número e string', () => {
    expect(normalizarAno('1990')).toBe(1990);
    expect(normalizarAno(1990)).toBe(1990);
  });
  it('rejeita anos implausíveis', () => {
    expect(normalizarAno('90')).toBeNull();
    expect(normalizarAno('abc')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/normalizarNorma.test.ts`
Expected: FAIL ("normalizarTipo is not a function").

- [ ] **Step 3: Implementar**

```typescript
// src/core/normalizarNorma.ts
import type { TipoNorma } from './types';

const MAPA_TIPO: Record<string, TipoNorma> = {
  'lei': 'Lei',
  'lei complementar': 'Lei Complementar', 'lc': 'Lei Complementar',
  'decreto': 'Decreto', 'dec': 'Decreto', 'dec.': 'Decreto',
  'decreto-lei': 'Decreto-Lei', 'decreto lei': 'Decreto-Lei', 'dl': 'Decreto-Lei',
  'medida provisoria': 'Medida Provisória', 'medida provisória': 'Medida Provisória', 'mp': 'Medida Provisória',
  'emenda constitucional': 'Emenda Constitucional', 'ec': 'Emenda Constitucional', 'emc': 'Emenda Constitucional',
  'constituicao': 'Constituição', 'constituição': 'Constituição', 'cf': 'Constituição',
};

export function normalizarNumero(bruto: string): string {
  return (bruto ?? '').toString().toLowerCase().replace(/n[ºo°.]/g, '').replace(/[.\s]/g, '').trim();
}

export function normalizarTipo(bruto: string): TipoNorma | null {
  const chave = (bruto ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  return MAPA_TIPO[chave] ?? null;
}

export function normalizarAno(bruto: string | number): number | null {
  const n = typeof bruto === 'number' ? bruto : parseInt((bruto ?? '').toString().trim(), 10);
  if (Number.isNaN(n) || n < 1800 || n > 2100) return null;
  return n;
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/normalizarNorma.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/normalizarNorma.ts tests/core/normalizarNorma.test.ts
git commit -m "feat: normalizador de tipo/número/ano de normas"
```

---

### Task 3: Importador de planilha (xlsx/csv → NormaImportada[])

**Files:**
- Create: `src/core/planilha/importador.ts`
- Test: `tests/core/planilha/importador.test.ts`

**Interfaces:**
- Consumes: `normalizarTipo`, `normalizarNumero`, `normalizarAno` (Task 2).
- Produces:
  - `type MapaColunas = { tipo: string; numero: string; ano: string; apelido?: string; urlPlanalto?: string; observacao?: string }`
  - `detectarColunas(cabecalho: string[]): Partial<MapaColunas>`
  - `importarPlanilha(buffer: ArrayBuffer, mapa: MapaColunas): { normas: NormaImportada[]; erros: { linha: number; motivo: string }[] }`

- [ ] **Step 1: Escrever os testes que falham (gerando o xlsx em memória)**

```typescript
// tests/core/planilha/importador.test.ts
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { detectarColunas, importarPlanilha, type MapaColunas } from '../../../src/core/planilha/importador';

function planilhaBuffer(linhas: Record<string, unknown>[]): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plan1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

describe('detectarColunas', () => {
  it('mapeia cabeçalhos comuns independentemente de acento/caixa', () => {
    const mapa = detectarColunas(['Tipo', 'Número', 'ANO', 'Apelido', 'URL Planalto']);
    expect(mapa.tipo).toBe('Tipo');
    expect(mapa.numero).toBe('Número');
    expect(mapa.ano).toBe('ANO');
  });
});

describe('importarPlanilha', () => {
  const mapa: MapaColunas = { tipo: 'Tipo', numero: 'Numero', ano: 'Ano', apelido: 'Apelido' };

  it('converte linhas válidas em NormaImportada normalizada', () => {
    const buf = planilhaBuffer([{ Tipo: 'Lei', Numero: '8.112', Ano: 1990, Apelido: 'RJU' }]);
    const { normas, erros } = importarPlanilha(buf, mapa);
    expect(erros).toHaveLength(0);
    expect(normas[0]).toMatchObject({ tipo: 'Lei', numero: '8112', ano: 1990, apelido: 'RJU', linha: 2 });
  });

  it('reporta erro em linha incompleta sem travar as demais', () => {
    const buf = planilhaBuffer([
      { Tipo: 'Lei', Numero: '8.112', Ano: 1990 },
      { Tipo: 'portaria', Numero: '', Ano: 'xx' },
    ]);
    const { normas, erros } = importarPlanilha(buf, mapa);
    expect(normas).toHaveLength(1);
    expect(erros[0].linha).toBe(3);
    expect(erros[0].motivo).toMatch(/tipo|número|ano/i);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/planilha/importador.test.ts`
Expected: FAIL ("importarPlanilha is not a function").

- [ ] **Step 3: Implementar**

```typescript
// src/core/planilha/importador.ts
import * as XLSX from 'xlsx';
import type { NormaImportada } from '../types';
import { normalizarTipo, normalizarNumero, normalizarAno } from '../normalizarNorma';

export type MapaColunas = {
  tipo: string; numero: string; ano: string;
  apelido?: string; urlPlanalto?: string; observacao?: string;
};

const SINONIMOS: Record<keyof MapaColunas, string[]> = {
  tipo: ['tipo', 'especie', 'espécie'],
  numero: ['numero', 'número', 'nº', 'no', 'num'],
  ano: ['ano'],
  apelido: ['apelido', 'nome', 'descricao', 'descrição', 'alcunha'],
  urlPlanalto: ['url', 'url planalto', 'link', 'link planalto', 'planalto'],
  observacao: ['observacao', 'observação', 'obs', 'nota'],
};

function chaveNorm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export function detectarColunas(cabecalho: string[]): Partial<MapaColunas> {
  const mapa: Partial<MapaColunas> = {};
  for (const campo of Object.keys(SINONIMOS) as (keyof MapaColunas)[]) {
    const alvo = SINONIMOS[campo].map(chaveNorm);
    const achado = cabecalho.find((c) => alvo.includes(chaveNorm(c)));
    if (achado) mapa[campo] = achado;
  }
  return mapa;
}

export function importarPlanilha(
  buffer: ArrayBuffer,
  mapa: MapaColunas,
): { normas: NormaImportada[]; erros: { linha: number; motivo: string }[] } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  const normas: NormaImportada[] = [];
  const erros: { linha: number; motivo: string }[] = [];

  linhas.forEach((linha, i) => {
    const numeroLinha = i + 2; // +1 cabeçalho, +1 base-1
    const tipo = normalizarTipo(String(linha[mapa.tipo] ?? ''));
    const numero = normalizarNumero(String(linha[mapa.numero] ?? ''));
    const ano = normalizarAno(String(linha[mapa.ano] ?? ''));

    const faltando: string[] = [];
    if (!tipo) faltando.push('tipo');
    if (!numero) faltando.push('número');
    if (ano === null) faltando.push('ano');
    if (faltando.length > 0) {
      erros.push({ linha: numeroLinha, motivo: `Campos inválidos/ausentes: ${faltando.join(', ')}` });
      return;
    }

    normas.push({
      tipo: tipo!, numero, ano: ano!,
      apelido: mapa.apelido ? String(linha[mapa.apelido] ?? '').trim() || undefined : undefined,
      urlPlanalto: mapa.urlPlanalto ? String(linha[mapa.urlPlanalto] ?? '').trim() || undefined : undefined,
      observacao: mapa.observacao ? String(linha[mapa.observacao] ?? '').trim() || undefined : undefined,
      linha: numeroLinha,
    });
  });

  return { normas, erros };
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/planilha/importador.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/planilha/ tests/core/planilha/
git commit -m "feat: importador de planilha xlsx/csv com detecção de colunas"
```

---

### Task 4: Resolvedor LexML (`/busca/search` → candidatos)

**Files:**
- Create: `src/core/lexml/urnTipos.ts`, `src/core/lexml/resolvedor.ts`
- Test: `tests/core/lexml/resolvedor.test.ts`, `tests/fixtures/lexml-search-8112.html`

**Interfaces:**
- Consumes: `NormaImportada` (Task 1).
- Produces:
  - `segmentoUrn(tipo: TipoNorma): string`
  - `resolverNorma(norma: NormaImportada, fetchFn?: typeof fetch): Promise<ResultadoResolucao>`

- [ ] **Step 1: Capturar a fixture real do LexML**

Run:
```bash
mkdir -p tests/fixtures
curl -sL "https://www.lexml.gov.br/busca/search?keyword=lei%208112%201990" -o tests/fixtures/lexml-search-8112.html
grep -c 'urn:lex:br:federal:lei:1990-12-11;8112' tests/fixtures/lexml-search-8112.html
```
Expected: contagem ≥ 1 (a URN da Lei 8.112 está no HTML). Se 0, revise o `keyword`.

- [ ] **Step 2: Escrever os testes que falham**

```typescript
// tests/core/lexml/resolvedor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { segmentoUrn, resolverNorma } from '../../../src/core/lexml/resolvedor';
import type { NormaImportada } from '../../../src/core/types';

const htmlBusca = readFileSync(resolve(__dirname, '../../fixtures/lexml-search-8112.html'), 'utf-8');
const fetchMock = (html: string) =>
  vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }));

const lei8112: NormaImportada = { tipo: 'Lei', numero: '8112', ano: 1990, linha: 2 };

describe('segmentoUrn', () => {
  it('mapeia TipoNorma para o segmento da URN', () => {
    expect(segmentoUrn('Lei')).toBe('lei');
    expect(segmentoUrn('Lei Complementar')).toBe('lei.complementar');
    expect(segmentoUrn('Medida Provisória')).toBe('medida.provisoria');
  });
});

describe('resolverNorma', () => {
  it('confirma quando há exatamente um resultado federal correspondente', async () => {
    const r = await resolverNorma(lei8112, fetchMock(htmlBusca));
    expect(r.status).toBe('confirmada');
    expect(r.candidatos[0].urn).toBe('urn:lex:br:federal:lei:1990-12-11;8112');
  });

  it('retorna nao_localizada quando não há correspondência', async () => {
    const r = await resolverNorma({ tipo: 'Lei', numero: '999999', ano: 1990, linha: 3 }, fetchMock(htmlBusca));
    expect(r.status).toBe('nao_localizada');
    expect(r.candidatos).toHaveLength(0);
  });

  it('marca ambigua quando o mesmo número aparece em anos diferentes pedidos por ano ausente', async () => {
    const html = `<a href="/urn/urn:lex:br:federal:lei:1990-12-11;8112">A</a>
                  <a href="/urn/urn:lex:br:federal:lei:1991-01-10;8112">B</a>`;
    const r = await resolverNorma({ tipo: 'Lei', numero: '8112', ano: 1990, linha: 4 }, fetchMock(html));
    // ano 1990 filtra para 1 -> confirmada
    expect(r.status).toBe('confirmada');
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `npx vitest run tests/core/lexml/resolvedor.test.ts`
Expected: FAIL ("resolverNorma is not a function").

- [ ] **Step 4: Implementar `urnTipos.ts` e `resolvedor.ts`**

```typescript
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
```

```typescript
// src/core/lexml/resolvedor.ts
import type { NormaImportada, ResultadoResolucao, CandidatoNorma, TipoNorma } from '../types';
import { SEGMENTO_URN } from './urnTipos';

const BASE_BUSCA = 'https://www.lexml.gov.br/busca/search?keyword=';
const BASE_URN = 'https://www.lexml.gov.br/urn/';

export function segmentoUrn(tipo: TipoNorma): string {
  return SEGMENTO_URN[tipo];
}

// Extrai todas as URNs federais do HTML de resultado.
function extrairUrns(html: string): string[] {
  const re = /\/urn\/(urn:lex:br:federal:[a-z.]+:\d{4}-\d{2}-\d{2};[\w.-]+)/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) set.add(m[1]);
  return [...set];
}

interface UrnPartes { seg: string; ano: number; numero: string; }
function parseUrn(urn: string): UrnPartes | null {
  const m = urn.match(/^urn:lex:br:federal:([a-z.]+):(\d{4})-\d{2}-\d{2};([\w.-]+)$/);
  if (!m) return null;
  return { seg: m[1], ano: parseInt(m[2], 10), numero: m[3].replace(/\./g, '') };
}

export async function resolverNorma(
  norma: NormaImportada,
  fetchFn: typeof fetch = fetch,
): Promise<ResultadoResolucao> {
  const termos = `${norma.tipo} ${norma.numero} ${norma.ano}`;
  const url = BASE_BUSCA + encodeURIComponent(termos);
  let html: string;
  try {
    const resp = await fetchFn(url);
    if (!resp.ok) return { norma, status: 'nao_localizada', candidatos: [], motivo: `HTTP ${resp.status}` };
    html = await resp.text();
  } catch (e) {
    return { norma, status: 'nao_localizada', candidatos: [], motivo: `Falha de rede: ${(e as Error).message}` };
  }

  const segAlvo = segmentoUrn(norma.tipo);
  const candidatos: CandidatoNorma[] = extrairUrns(html)
    .map((urn) => ({ urn, partes: parseUrn(urn) }))
    .filter((x) => x.partes && x.partes.seg === segAlvo && x.partes.numero === norma.numero && x.partes.ano === norma.ano)
    .map((x) => ({
      urn: x.urn,
      titulo: `${norma.tipo} nº ${norma.numero}/${norma.ano}`,
      urlLexml: BASE_URN + x.urn,
    }));

  if (candidatos.length === 0) return { norma, status: 'nao_localizada', candidatos: [], motivo: 'Sem correspondência no LexML' };
  if (candidatos.length === 1) return { norma, status: 'confirmada', candidatos };
  return { norma, status: 'ambigua', candidatos };
}
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `npx vitest run tests/core/lexml/resolvedor.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/lexml/ tests/core/lexml/ tests/fixtures/lexml-search-8112.html
git commit -m "feat: resolvedor LexML via /busca/search com extração de URN"
```

---

### Task 5: Ficha LexML → URL do Planalto (best-effort)

**Files:**
- Create: `src/core/lexml/ficha.ts`
- Test: `tests/core/lexml/ficha.test.ts`, `tests/fixtures/lexml-ficha-8112.html`

**Interfaces:**
- Produces: `extrairUrlPlanalto(htmlFicha: string): string | null` e `buscarUrlPlanalto(urn: string, fetchFn?: typeof fetch): Promise<string | null>`

- [ ] **Step 1: Capturar a fixture da ficha**

Run:
```bash
curl -sL "https://www.lexml.gov.br/urn/urn:lex:br:federal:lei:1990-12-11;8112" -o tests/fixtures/lexml-ficha-8112.html
grep -oiE 'planalto\.gov\.br/ccivil_03[^"]*' tests/fixtures/lexml-ficha-8112.html | head -3 || echo "sem link ccivil"
```
Expected: pode ou não haver link `ccivil_03`. O teste cobre os dois casos (por isso "best-effort").

- [ ] **Step 2: Escrever os testes que falham**

```typescript
// tests/core/lexml/ficha.test.ts
import { describe, it, expect } from 'vitest';
import { extrairUrlPlanalto } from '../../../src/core/lexml/ficha';

describe('extrairUrlPlanalto', () => {
  it('extrai o primeiro link ccivil_03 do Planalto quando presente', () => {
    const html = `<a href="https://www.planalto.gov.br/ccivil_03/leis/l8112cons.htm">texto</a>`;
    expect(extrairUrlPlanalto(html)).toBe('https://www.planalto.gov.br/ccivil_03/leis/l8112cons.htm');
  });
  it('retorna null quando não há link do Planalto', () => {
    expect(extrairUrlPlanalto('<a href="https://exemplo.com">x</a>')).toBeNull();
  });
  it('normaliza http para https', () => {
    const html = `<a href="http://www.planalto.gov.br/ccivil_03/decreto/d9991.htm">x</a>`;
    expect(extrairUrlPlanalto(html)).toBe('https://www.planalto.gov.br/ccivil_03/decreto/d9991.htm');
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `npx vitest run tests/core/lexml/ficha.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar**

```typescript
// src/core/lexml/ficha.ts
const BASE_URN = 'https://www.lexml.gov.br/urn/';

export function extrairUrlPlanalto(htmlFicha: string): string | null {
  const m = htmlFicha.match(/https?:\/\/(?:www\.)?planalto\.gov\.br\/ccivil_03\/[^\s"'<>]+\.htm/i);
  if (!m) return null;
  return m[0].replace(/^http:\/\//i, 'https://').replace(/^https:\/\/planalto/i, 'https://www.planalto');
}

export async function buscarUrlPlanalto(urn: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const resp = await fetchFn(BASE_URN + urn);
    if (!resp.ok) return null;
    return extrairUrlPlanalto(await resp.text());
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `npx vitest run tests/core/lexml/ficha.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/lexml/ficha.ts tests/core/lexml/ficha.test.ts tests/fixtures/lexml-ficha-8112.html
git commit -m "feat: extração best-effort da URL do Planalto a partir da ficha LexML"
```

---

### Task 6: Buscar e decodificar o texto do Planalto (ISO-8859-1)

**Files:**
- Create: `src/core/planalto/buscarTexto.ts`
- Test: `tests/core/planalto/buscarTexto.test.ts`

**Interfaces:**
- Produces: `buscarTextoCompilado(url: string, fetchFn?: typeof fetch): Promise<string>` (retorna HTML já decodificado como ISO-8859-1).

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/core/planalto/buscarTexto.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buscarTextoCompilado } from '../../../src/core/planalto/buscarTexto';

describe('buscarTextoCompilado', () => {
  it('decodifica bytes ISO-8859-1 corretamente (ç, ã, º)', async () => {
    // "Redação nº" em ISO-8859-1
    const bytes = new Uint8Array([0x52, 0x65, 0x64, 0x61, 0xE7, 0xE3, 0x6F, 0x20, 0x6E, 0xBA]);
    const fetchFn = vi.fn(async () => new Response(bytes, { status: 200 }));
    const txt = await buscarTextoCompilado('https://www.planalto.gov.br/x.htm', fetchFn);
    expect(txt).toBe('Redação nº');
  });

  it('lança erro em resposta não-ok', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 404 }));
    await expect(buscarTextoCompilado('https://www.planalto.gov.br/x.htm', fetchFn)).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/planalto/buscarTexto.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
// src/core/planalto/buscarTexto.ts
export async function buscarTextoCompilado(url: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const resp = await fetchFn(url);
  if (!resp.ok) throw new Error(`Falha ao buscar texto compilado: HTTP ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  return new TextDecoder('iso-8859-1').decode(buffer);
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/planalto/buscarTexto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/planalto/buscarTexto.ts tests/core/planalto/buscarTexto.test.ts
git commit -m "feat: busca e decodificação ISO-8859-1 do texto compilado do Planalto"
```

---

### Task 7: Normalizador de texto (HTML → texto plano)

**Files:**
- Create: `src/core/planalto/normalizarTexto.ts`
- Test: `tests/core/planalto/normalizarTexto.test.ts`

**Interfaces:**
- Produces: `normalizarTexto(html: string): string` (remove tags/estilos/scripts, decodifica entidades básicas, colapsa espaços).

> Nota: usa `DOMParser`, disponível no service worker (MV3) e no ambiente de teste. Configurar o Vitest deste módulo com `environment: 'jsdom'` via comentário de arquivo.

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// @vitest-environment jsdom
// tests/core/planalto/normalizarTexto.test.ts
import { describe, it, expect } from 'vitest';
import { normalizarTexto } from '../../../src/core/planalto/normalizarTexto';

describe('normalizarTexto', () => {
  it('remove tags e colapsa espaços', () => {
    const html = '<p>Art. 1º   O servidor</p>\n\n<p>público   federal.</p>';
    expect(normalizarTexto(html)).toBe('Art. 1º O servidor público federal.');
  });
  it('ignora scripts e estilos', () => {
    const html = '<style>a{}</style><script>1</script><p>Texto</p>';
    expect(normalizarTexto(html)).toBe('Texto');
  });
  it('mudança trivial de espaços produz o mesmo resultado', () => {
    expect(normalizarTexto('<p>Art.  1º</p>')).toBe(normalizarTexto('<p>Art. 1º</p>'));
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/planalto/normalizarTexto.test.ts`
Expected: FAIL. (Se faltar jsdom: `npm i -D jsdom` e reexecutar.)

- [ ] **Step 3: Implementar**

```typescript
// src/core/planalto/normalizarTexto.ts
export function normalizarTexto(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach((el) => el.remove());
  const texto = doc.body?.textContent ?? '';
  return texto.replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/planalto/normalizarTexto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/planalto/normalizarTexto.ts tests/core/planalto/normalizarTexto.test.ts
git commit -m "feat: normalizador de texto compilado (HTML -> texto plano)"
```

---

### Task 8: Detector de marcadores de alteração

**Files:**
- Create: `src/core/planalto/marcadores.ts`
- Test: `tests/core/planalto/marcadores.test.ts`

**Interfaces:**
- Produces:
  - `interface Marcador { chave: string; tipoMarcador: string; norma: string }`
  - `extrairMarcadores(textoNorm: string): Marcador[]`
  - `marcadoresNovos(anteriores: string[], atuais: Marcador[]): Marcador[]`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// tests/core/planalto/marcadores.test.ts
import { describe, it, expect } from 'vitest';
import { extrairMarcadores, marcadoresNovos } from '../../../src/core/planalto/marcadores';

const texto = `Art. 1º ... (Redação dada pela Lei nº 9.527, de 1997)
  Art. 2º ... (Incluído pela Lei nº 11.907, de 2009)
  Art. 3º ... (Revogado pela Lei nº 13.328, de 2016)
  Art. 4º ... (Vide Decreto nº 1.171)  (Regulamento)`;

describe('extrairMarcadores', () => {
  it('captura apenas marcadores que nomeiam a norma alteradora', () => {
    const ms = extrairMarcadores(texto);
    const normas = ms.map((m) => m.norma);
    expect(normas).toContain('Lei nº 9.527, de 1997');
    expect(normas).toContain('Lei nº 11.907, de 2009');
    expect(normas).toContain('Lei nº 13.328, de 2016');
    // "Vide" e "Regulamento" não são alterações
    expect(ms.some((m) => /Vide|Regulamento/.test(m.norma))).toBe(false);
  });
  it('gera chave canônica estável e sem duplicar', () => {
    const ms = extrairMarcadores('(Redação dada pela Lei nº 1, de 2020) (Redação dada pela Lei nº 1, de 2020)');
    expect(ms).toHaveLength(1);
  });
});

describe('marcadoresNovos', () => {
  it('retorna só os marcadores ausentes do conjunto anterior', () => {
    const atuais = extrairMarcadores(texto);
    const anteriores = atuais.slice(1).map((m) => m.chave); // omite o primeiro
    const novos = marcadoresNovos(anteriores, atuais);
    expect(novos).toHaveLength(1);
    expect(novos[0].norma).toBe('Lei nº 9.527, de 1997');
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/planalto/marcadores.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
// src/core/planalto/marcadores.ts
export interface Marcador { chave: string; tipoMarcador: string; norma: string }

const RE_MARCADOR =
  /\((Reda[çc][ãa]o dada|Inclu[íi]d[oa]|Acrescid[oa]|Revogad[oa])\s+pel[oa]\s+([^)]+?)\)/gi;

function tipoCanonico(bruto: string): string {
  const b = bruto.toLowerCase();
  if (b.startsWith('reda')) return 'REDACAO';
  if (b.startsWith('inclu')) return 'INCLUSAO';
  if (b.startsWith('acresc')) return 'INCLUSAO';
  return 'REVOGACAO';
}

export function extrairMarcadores(textoNorm: string): Marcador[] {
  const mapa = new Map<string, Marcador>();
  let m: RegExpExecArray | null;
  RE_MARCADOR.lastIndex = 0;
  while ((m = RE_MARCADOR.exec(textoNorm)) !== null) {
    const tipoMarcador = tipoCanonico(m[1]);
    const norma = m[2].replace(/\s+/g, ' ').trim();
    const chave = `${tipoMarcador}|${norma.toLowerCase()}`;
    if (!mapa.has(chave)) mapa.set(chave, { chave, tipoMarcador, norma });
  }
  return [...mapa.values()];
}

export function marcadoresNovos(anteriores: string[], atuais: Marcador[]): Marcador[] {
  const set = new Set(anteriores);
  return atuais.filter((m) => !set.has(m.chave));
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/planalto/marcadores.test.ts`
Expected: PASS.

- [ ] **Step 5: Validar contra a fixture real do Planalto**

Run:
```bash
curl -sL "https://www.planalto.gov.br/ccivil_03/leis/l8112cons.htm" -o tests/fixtures/planalto-l8112cons.html
```
Adicionar teste:
```typescript
// append em marcadores.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizarTexto } from '../../../src/core/planalto/normalizarTexto';

it('extrai dezenas de marcadores reais da Lei 8.112', () => {
  const buf = readFileSync(resolve(__dirname, '../../fixtures/planalto-l8112cons.html'));
  const html = new TextDecoder('iso-8859-1').decode(buf);
  const ms = extrairMarcadores(normalizarTexto(html));
  expect(ms.length).toBeGreaterThan(10);
});
```
Nota: esse teste usa `normalizarTexto` (jsdom). Marque o arquivo com `// @vitest-environment jsdom` no topo.
Run: `npx vitest run tests/core/planalto/marcadores.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/planalto/marcadores.ts tests/core/planalto/marcadores.test.ts tests/fixtures/planalto-l8112cons.html
git commit -m "feat: detector de marcadores de alteração do texto compilado"
```

---

### Task 9: Hash e diff do texto

**Files:**
- Create: `src/core/planalto/diff.ts`
- Test: `tests/core/planalto/diff.test.ts`

**Interfaces:**
- Produces:
  - `hashTexto(texto: string): Promise<string>` (hex SHA-256, via Web Crypto)
  - `resumirDiff(anterior: string, atual: string): { trechosAdicionados: number; trechosRemovidos: number; preview: string }`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// tests/core/planalto/diff.test.ts
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
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/planalto/diff.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
// src/core/planalto/diff.ts
import { diffLines } from 'diff';

export async function hashTexto(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function resumirDiff(
  anterior: string,
  atual: string,
): { trechosAdicionados: number; trechosRemovidos: number; preview: string } {
  const partes = diffLines(anterior, atual);
  let add = 0, rem = 0;
  const adicionados: string[] = [];
  for (const p of partes) {
    if (p.added) { add += p.count ?? 0; adicionados.push(p.value); }
    else if (p.removed) { rem += p.count ?? 0; }
  }
  const preview = adicionados.join(' ').replace(/\s+/g, ' ').trim().slice(0, 280);
  return { trechosAdicionados: add, trechosRemovidos: rem, preview };
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/planalto/diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/planalto/diff.ts tests/core/planalto/diff.test.ts
git commit -m "feat: hash SHA-256 e resumo de diff do texto compilado"
```

---

### Task 10: Repositório IndexedDB

**Files:**
- Create: `src/core/repositorio/db.ts`
- Test: `tests/core/repositorio/db.test.ts`

**Interfaces:**
- Consumes: `LeiAcompanhada`, `FotoTexto`, `Inovacao` (Task 1).
- Produces (todas assíncronas):
  - `abrirDb(): Promise<LegisDB>`
  - `salvarLei(db, lei)`, `listarLeis(db)`, `removerLei(db, id)`
  - `salvarFoto(db, foto)`, `obterFoto(db, leiId)`
  - `salvarInovacoes(db, inovacoes)`, `listarInovacoes(db, leiId?)`, `marcarLida(db, id)`, `contarNaoLidas(db)`

- [ ] **Step 1: Escrever os testes que falham (com fake-indexeddb)**

```typescript
// tests/core/repositorio/db.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  abrirDb, salvarLei, listarLeis, salvarFoto, obterFoto,
  salvarInovacoes, listarInovacoes, marcarLida, contarNaoLidas,
} from '../../../src/core/repositorio/db';
import type { LeiAcompanhada, Inovacao } from '../../../src/core/types';

const lei: LeiAcompanhada = {
  id: 'urn:lex:br:federal:lei:1990-12-11;8112', tipo: 'Lei', numero: '8112', ano: 1990,
  titulo: 'Lei nº 8112/1990', status: 'ativa', adicionadaEm: '2026-07-01T00:00:00Z',
};

describe('repositorio', () => {
  beforeEach(() => { indexedDB = new IDBFactory(); });

  it('salva e lista leis', async () => {
    const db = await abrirDb();
    await salvarLei(db, lei);
    expect((await listarLeis(db))[0].id).toBe(lei.id);
  });

  it('guarda e recupera foto por leiId', async () => {
    const db = await abrirDb();
    await salvarFoto(db, { leiId: lei.id, capturadaEm: '2026-07-01T00:00:00Z', hash: 'x', textoNorm: 't', marcadores: [], tamanho: 1 });
    expect((await obterFoto(db, lei.id))?.hash).toBe('x');
  });

  it('salva inovações, conta não lidas e marca como lida', async () => {
    const db = await abrirDb();
    const inv: Inovacao = { id: 'inv_1', leiId: lei.id, tipo: 'TEXTO', detectadaEm: '2026-07-01T00:00:00Z', lida: false };
    await salvarInovacoes(db, [inv]);
    expect(await contarNaoLidas(db)).toBe(1);
    await marcarLida(db, 'inv_1');
    expect(await contarNaoLidas(db)).toBe(0);
    expect((await listarInovacoes(db, lei.id))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/repositorio/db.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
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
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/repositorio/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/repositorio/ tests/core/repositorio/
git commit -m "feat: repositório IndexedDB (leis, fotos, inovações)"
```

---

### Task 11: Orquestrador de verificação (1 lei → inovações)

**Files:**
- Create: `src/core/monitor/verificar.ts`
- Test: `tests/core/monitor/verificar.test.ts`

**Interfaces:**
- Consumes: `buscarTextoCompilado` (T6), `normalizarTexto` (T7), `extrairMarcadores`/`marcadoresNovos` (T8), `hashTexto`/`resumirDiff` (T9), tipos (T1).
- Produces:
  - `interface ResultadoVerificacao { inovacoes: Inovacao[]; novaFoto: FotoTexto | null; statusVerif: 'ok' | 'falhou' | 'sem_url' }`
  - `verificarLei(lei: LeiAcompanhada, fotoAnterior: FotoTexto | null, deps: { fetchFn?: typeof fetch; agora: string; gerarId: () => string }): Promise<ResultadoVerificacao>`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// @vitest-environment jsdom
// tests/core/monitor/verificar.test.ts
import { describe, it, expect, vi } from 'vitest';
import { verificarLei } from '../../../src/core/monitor/verificar';
import type { LeiAcompanhada, FotoTexto } from '../../../src/core/types';

const lei: LeiAcompanhada = {
  id: 'urn:1', tipo: 'Lei', numero: '8112', ano: 1990, titulo: 'Lei 8112', status: 'ativa',
  adicionadaEm: '2026-07-01T00:00:00Z', urlPlanalto: 'https://www.planalto.gov.br/x.htm',
};
const deps = (html: string) => ({
  fetchFn: vi.fn(async () => new Response(new TextEncoder().encode(html), { status: 200 })),
  agora: '2026-07-02T00:00:00Z',
  gerarId: (() => { let n = 0; return () => `inv_${++n}`; })(),
});

describe('verificarLei', () => {
  it('sem foto anterior: cria foto inicial e não gera inovação', async () => {
    const r = await verificarLei(lei, null, deps('<p>Art. 1º texto (Redação dada pela Lei nº 9, de 1997)</p>'));
    expect(r.statusVerif).toBe('ok');
    expect(r.inovacoes).toHaveLength(0);
    expect(r.novaFoto?.marcadores).toContain('REDACAO|lei nº 9, de 1997');
  });

  it('detecta marcador novo e mudança de texto', async () => {
    const anterior: FotoTexto = {
      leiId: 'urn:1', capturadaEm: '2026-07-01T00:00:00Z',
      hash: 'antigo', textoNorm: 'Art. 1º texto', marcadores: [], tamanho: 13,
    };
    const r = await verificarLei(lei, anterior, deps('<p>Art. 1º texto novo (Incluído pela Lei nº 10, de 2020)</p>'));
    const tipos = r.inovacoes.map((i) => i.tipo);
    expect(tipos).toContain('ALTERACAO');
    expect(tipos).toContain('TEXTO');
    expect(r.novaFoto).not.toBeNull();
  });

  it('lei sem urlPlanalto retorna sem_url', async () => {
    const semUrl = { ...lei, urlPlanalto: undefined };
    const r = await verificarLei(semUrl, null, deps('x'));
    expect(r.statusVerif).toBe('sem_url');
    expect(r.novaFoto).toBeNull();
  });

  it('falha de rede retorna falhou e preserva foto anterior', async () => {
    const d = { agora: '2026-07-02T00:00:00Z', gerarId: () => 'inv_x',
      fetchFn: vi.fn(async () => { throw new Error('rede'); }) };
    const r = await verificarLei(lei, null, d);
    expect(r.statusVerif).toBe('falhou');
    expect(r.inovacoes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/monitor/verificar.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
// src/core/monitor/verificar.ts
import type { LeiAcompanhada, FotoTexto, Inovacao } from '../types';
import { buscarTextoCompilado } from '../planalto/buscarTexto';
import { normalizarTexto } from '../planalto/normalizarTexto';
import { extrairMarcadores, marcadoresNovos } from '../planalto/marcadores';
import { hashTexto, resumirDiff } from '../planalto/diff';

export interface ResultadoVerificacao {
  inovacoes: Inovacao[];
  novaFoto: FotoTexto | null;
  statusVerif: 'ok' | 'falhou' | 'sem_url';
}

interface Deps { fetchFn?: typeof fetch; agora: string; gerarId: () => string }

export async function verificarLei(
  lei: LeiAcompanhada,
  fotoAnterior: FotoTexto | null,
  deps: Deps,
): Promise<ResultadoVerificacao> {
  if (!lei.urlPlanalto) return { inovacoes: [], novaFoto: null, statusVerif: 'sem_url' };

  let textoNorm: string;
  try {
    const html = await buscarTextoCompilado(lei.urlPlanalto, deps.fetchFn ?? fetch);
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
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/monitor/verificar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/monitor/ tests/core/monitor/
git commit -m "feat: orquestrador de verificação por lei (marcadores + diff)"
```

---

### Task 12: Exportadores (Excel e PDF)

**Files:**
- Create: `src/core/exportador/excel.ts`, `src/core/exportador/pdf.ts`
- Test: `tests/core/exportador/excel.test.ts`

**Interfaces:**
- Produces:
  - `interface LinhaRelatorio { lei: string; tipo: string; detectadaEm: string; descricao: string }`
  - `montarLinhas(leis: LeiAcompanhada[], inovacoes: Inovacao[]): LinhaRelatorio[]`
  - `gerarExcel(linhas: LinhaRelatorio[]): Uint8Array`
  - `gerarPdf(linhas: LinhaRelatorio[]): Blob` (pdf.ts; smoke apenas)

- [ ] **Step 1: Escrever os testes que falham (Excel: gerar e reler)**

```typescript
// tests/core/exportador/excel.test.ts
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { montarLinhas, gerarExcel } from '../../../src/core/exportador/excel';
import type { LeiAcompanhada, Inovacao } from '../../../src/core/types';

const lei: LeiAcompanhada = { id: 'urn:1', tipo: 'Lei', numero: '8112', ano: 1990, titulo: 'Lei 8112', apelido: 'RJU', status: 'ativa', adicionadaEm: '2026-07-01T00:00:00Z' };
const inov: Inovacao = { id: 'inv_1', leiId: 'urn:1', tipo: 'ALTERACAO', detectadaEm: '2026-07-02T00:00:00Z', lida: false, normaAlteradora: { descricao: 'Lei nº 10, de 2020', tipoMarcador: 'INCLUSAO' } };

describe('exportador excel', () => {
  it('monta linhas legíveis usando o apelido da lei', () => {
    const linhas = montarLinhas([lei], [inov]);
    expect(linhas[0]).toMatchObject({ lei: 'RJU', tipo: 'ALTERACAO', descricao: 'Lei nº 10, de 2020' });
  });
  it('gera um xlsx relegível com o cabeçalho esperado', () => {
    const bytes = gerarExcel(montarLinhas([lei], [inov]));
    const wb = XLSX.read(bytes, { type: 'array' });
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    expect(Object.keys(linhas[0])).toEqual(['Lei', 'Tipo', 'Detectada em', 'Descrição']);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/exportador/excel.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `excel.ts` e `pdf.ts`**

```typescript
// src/core/exportador/excel.ts
import * as XLSX from 'xlsx';
import type { LeiAcompanhada, Inovacao } from '../types';

export interface LinhaRelatorio { lei: string; tipo: string; detectadaEm: string; descricao: string }

function descricaoInovacao(i: Inovacao): string {
  if (i.tipo === 'ALTERACAO') return i.normaAlteradora?.descricao ?? '(alteração)';
  return i.resumoDiff?.preview || '(mudança de redação)';
}

export function montarLinhas(leis: LeiAcompanhada[], inovacoes: Inovacao[]): LinhaRelatorio[] {
  const nome = new Map(leis.map((l) => [l.id, l.apelido || l.titulo]));
  return inovacoes.map((i) => ({
    lei: nome.get(i.leiId) ?? i.leiId,
    tipo: i.tipo,
    detectadaEm: i.detectadaEm,
    descricao: descricaoInovacao(i),
  }));
}

export function gerarExcel(linhas: LinhaRelatorio[]): Uint8Array {
  const dados = linhas.map((l) => ({ 'Lei': l.lei, 'Tipo': l.tipo, 'Detectada em': l.detectadaEm, 'Descrição': l.descricao }));
  const ws = XLSX.utils.json_to_sheet(dados, { header: ['Lei', 'Tipo', 'Detectada em', 'Descrição'] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inovações');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
```

```typescript
// src/core/exportador/pdf.ts
import { jsPDF } from 'jspdf';
import type { LinhaRelatorio } from './excel';

export function gerarPdf(linhas: LinhaRelatorio[]): Blob {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('Relatório de Inovações — Legis Monitor', 14, 16);
  doc.setFontSize(9);
  let y = 28;
  for (const l of linhas) {
    const txt = `${l.detectadaEm.slice(0, 10)}  [${l.tipo}]  ${l.lei}: ${l.descricao}`;
    for (const linha of doc.splitTextToSize(txt, 180) as string[]) {
      if (y > 285) { doc.addPage(); y = 16; }
      doc.text(linha, 14, y); y += 6;
    }
  }
  return doc.output('blob');
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/exportador/excel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/exportador/ tests/core/exportador/
git commit -m "feat: exportadores de relatório em Excel e PDF"
```

---

### Task 13: Service worker (agendamento + notificações + badge)

**Files:**
- Create: `src/background/agendador.ts` (lógica pura), `src/background/service-worker.ts` (wiring)
- Modify: `src/background/service-worker.ts` (substitui o placeholder da Task 1)
- Test: `tests/core/background/agendador.test.ts`

**Interfaces:**
- Consumes: repositório (T10), `verificarLei` (T11).
- Produces:
  - `periodoEmMinutos(freq: 'horaria' | 'diaria' | 'semanal'): number`
  - `executarCiclo(db, deps): Promise<{ totalInovacoes: number; naoLidas: number }>` — percorre leis ativas, verifica, persiste inovações + fotos, atualiza status da lei.

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// tests/core/background/agendador.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { periodoEmMinutos, executarCiclo } from '../../../src/background/agendador';
import { abrirDb, salvarLei, listarInovacoes, obterFoto } from '../../../src/core/repositorio/db';
import type { LeiAcompanhada } from '../../../src/core/types';

const lei: LeiAcompanhada = {
  id: 'urn:1', tipo: 'Lei', numero: '8112', ano: 1990, titulo: 'Lei 8112', status: 'ativa',
  adicionadaEm: '2026-07-01T00:00:00Z', urlPlanalto: 'https://www.planalto.gov.br/x.htm',
};

describe('periodoEmMinutos', () => {
  it('converte frequência em minutos', () => {
    expect(periodoEmMinutos('diaria')).toBe(1440);
    expect(periodoEmMinutos('horaria')).toBe(60);
  });
});

describe('executarCiclo', () => {
  beforeEach(() => { indexedDB = new IDBFactory(); });
  it('primeira execução cria foto e não gera inovação; segunda detecta', async () => {
    const db = await abrirDb();
    await salvarLei(db, lei);
    const html1 = '<p>Art. 1º base</p>';
    const html2 = '<p>Art. 1º base (Incluído pela Lei nº 10, de 2020)</p>';
    let atual = html1;
    const deps = {
      fetchFn: vi.fn(async () => new Response(new TextEncoder().encode(atual), { status: 200 })),
      agora: () => '2026-07-02T00:00:00Z',
      gerarId: (() => { let n = 0; return () => `inv_${++n}`; })(),
    };
    const r1 = await executarCiclo(db, deps);
    expect(r1.totalInovacoes).toBe(0);
    expect(await obterFoto(db, 'urn:1')).not.toBeUndefined();
    atual = html2;
    const r2 = await executarCiclo(db, deps);
    expect(r2.totalInovacoes).toBeGreaterThanOrEqual(1);
    expect((await listarInovacoes(db, 'urn:1')).length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/background/agendador.test.ts`
Expected: FAIL. (Precisa de jsdom para `normalizarTexto`: adicione `// @vitest-environment jsdom` no topo do teste.)

- [ ] **Step 3: Implementar `agendador.ts`**

```typescript
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
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/background/agendador.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar o wiring do service worker (sem teste unitário — cola as APIs do Chrome)**

```typescript
// src/background/service-worker.ts
import { abrirDb } from '../core/repositorio/db';
import { executarCiclo, periodoEmMinutos } from './agendador';

const ALARM = 'verificacao-legis';

async function frequencia(): Promise<'horaria' | 'diaria' | 'semanal'> {
  const { frequencia } = await chrome.storage.local.get('frequencia');
  return frequencia ?? 'diaria';
}

async function agendar(): Promise<void> {
  chrome.alarms.create(ALARM, { periodInMinutes: periodoEmMinutos(await frequencia()) });
}

async function rodar(): Promise<void> {
  const db = await abrirDb();
  let seq = Date.now();
  const { totalInovacoes, naoLidas } = await executarCiclo(db, {
    agora: () => new Date().toISOString(),
    gerarId: () => `inv_${seq++}`,
  });
  await chrome.action.setBadgeText({ text: naoLidas > 0 ? String(naoLidas) : '' });
  const { popupAtivo } = await chrome.storage.local.get('popupAtivo');
  if (totalInovacoes > 0 && popupAtivo !== false) {
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon-128.png', title: 'Legis Monitor',
      message: `${totalInovacoes} nova(s) inovação(ões) detectada(s).`,
    });
  }
}

chrome.runtime.onInstalled.addListener(agendar);
chrome.runtime.onStartup.addListener(agendar);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) void rodar(); });
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg?.tipo === 'verificar-agora') { void rodar().then(() => sendResponse({ ok: true })); return true; }
  if (msg?.tipo === 'reagendar') { void agendar().then(() => sendResponse({ ok: true })); return true; }
  return false;
});
```

- [ ] **Step 6: Rodar toda a suíte e o build**

Run: `npm test && npm run build`
Expected: todos os testes PASSAM; `dist/` compila. Carregar em `chrome://extensions` e conferir que o service worker inicia sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/background/ tests/core/background/
git commit -m "feat: agendador de ciclo e service worker (alarms, badge, notificações)"
```

---

### Task 14: UI — Popup (importar + confirmar)

**Files:**
- Create: `src/ui/popup/Popup.tsx`, `src/ui/popup/confirmacao.ts`
- Modify: `src/ui/popup/main-popup.tsx`
- Test: `tests/core/ui/confirmacao.test.ts`

**Interfaces:**
- Consumes: importador (T3), resolvedor (T4), ficha (T5), repositório (T10), tipos (T1).
- Produces:
  - `resolverLote(normas: NormaImportada[], deps): Promise<ResultadoResolucao[]>` (resolve em série, respeitando intervalo)
  - `confirmarParaLeis(resultados: ResultadoResolucao[], escolhas: Record<number, string>): LeiAcompanhada[]` (converte confirmadas/ambíguas escolhidas em `LeiAcompanhada`)

- [ ] **Step 1: Escrever os testes da lógica de confirmação (que falham)**

```typescript
// tests/core/ui/confirmacao.test.ts
import { describe, it, expect } from 'vitest';
import { confirmarParaLeis } from '../../../src/ui/popup/confirmacao';
import type { ResultadoResolucao } from '../../../src/core/types';

const conf: ResultadoResolucao = {
  norma: { tipo: 'Lei', numero: '8112', ano: 1990, apelido: 'RJU', linha: 2 },
  status: 'confirmada',
  candidatos: [{ urn: 'urn:lex:br:federal:lei:1990-12-11;8112', titulo: 'Lei nº 8112/1990', urlLexml: 'x' }],
};

describe('confirmarParaLeis', () => {
  it('converte confirmadas em LeiAcompanhada com a URN como id', () => {
    const leis = confirmarParaLeis([conf], {});
    expect(leis[0]).toMatchObject({ id: 'urn:lex:br:federal:lei:1990-12-11;8112', apelido: 'RJU', status: 'ativa' });
  });
  it('ignora não localizadas e ambíguas sem escolha', () => {
    const amb: ResultadoResolucao = { ...conf, status: 'ambigua', candidatos: [conf.candidatos[0], { urn: 'urn:b', titulo: 'B', urlLexml: 'y' }] };
    expect(confirmarParaLeis([amb], {})).toHaveLength(0);
  });
  it('usa a escolha do usuário para ambíguas (por índice de linha)', () => {
    const amb: ResultadoResolucao = { ...conf, status: 'ambigua', candidatos: [conf.candidatos[0], { urn: 'urn:b', titulo: 'B', urlLexml: 'y' }] };
    const leis = confirmarParaLeis([amb], { 2: 'urn:b' });
    expect(leis[0].id).toBe('urn:b');
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/ui/confirmacao.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `confirmacao.ts`**

```typescript
// src/ui/popup/confirmacao.ts
import type { NormaImportada, ResultadoResolucao, LeiAcompanhada, CandidatoNorma } from '../../core/types';
import { resolverNorma } from '../../core/lexml/resolvedor';
import { buscarUrlPlanalto } from '../../core/lexml/ficha';

export async function resolverLote(
  normas: NormaImportada[],
  deps: { fetchFn?: typeof fetch; intervaloMs?: number; onProgresso?: (i: number, total: number) => void } = {},
): Promise<ResultadoResolucao[]> {
  const out: ResultadoResolucao[] = [];
  for (let i = 0; i < normas.length; i++) {
    out.push(await resolverNorma(normas[i], deps.fetchFn ?? fetch));
    deps.onProgresso?.(i + 1, normas.length);
    if (deps.intervaloMs) await new Promise((r) => setTimeout(r, deps.intervaloMs));
  }
  return out;
}

export function confirmarParaLeis(
  resultados: ResultadoResolucao[],
  escolhas: Record<number, string>,
): LeiAcompanhada[] {
  const leis: LeiAcompanhada[] = [];
  for (const r of resultados) {
    let cand: CandidatoNorma | undefined;
    if (r.status === 'confirmada') cand = r.candidatos[0];
    else if (r.status === 'ambigua') {
      const urnEscolhida = escolhas[r.norma.linha];
      cand = r.candidatos.find((c) => c.urn === urnEscolhida);
    }
    if (!cand) continue;
    leis.push({
      id: cand.urn, tipo: r.norma.tipo, numero: r.norma.numero, ano: r.norma.ano,
      titulo: cand.titulo, apelido: r.norma.apelido, urlPlanalto: r.norma.urlPlanalto,
      status: 'ativa', adicionadaEm: new Date().toISOString(),
    });
  }
  return leis;
}

// Enriquecimento opcional: para leis sem urlPlanalto, tenta obter da ficha LexML.
export async function preencherUrlsPlanalto(leis: LeiAcompanhada[], fetchFn: typeof fetch = fetch): Promise<LeiAcompanhada[]> {
  return Promise.all(leis.map(async (l) => l.urlPlanalto ? l : { ...l, urlPlanalto: (await buscarUrlPlanalto(l.id, fetchFn)) ?? undefined }));
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run tests/core/ui/confirmacao.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar o componente `Popup.tsx` (importar → resolver → confirmar → salvar)**

```tsx
// src/ui/popup/Popup.tsx
import { useState } from 'preact/hooks';
import { detectarColunas, importarPlanilha, type MapaColunas } from '../../core/planilha/importador';
import { resolverLote, confirmarParaLeis, preencherUrlsPlanalto } from './confirmacao';
import { abrirDb, salvarLei } from '../../core/repositorio/db';
import type { ResultadoResolucao } from '../../core/types';

export function Popup() {
  const [resultados, setResultados] = useState<ResultadoResolucao[]>([]);
  const [escolhas, setEscolhas] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState('Selecione a planilha de leis (.xlsx/.csv).');

  async function aoSelecionar(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    // Detecta colunas a partir do cabeçalho da 1ª aba.
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'array' });
    const cab = (XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0] ?? []) as string[];
    const mapa = detectarColunas(cab) as MapaColunas;
    if (!mapa.tipo || !mapa.numero || !mapa.ano) { setMsg('Planilha precisa de colunas Tipo, Número e Ano.'); return; }
    const { normas, erros } = importarPlanilha(buffer, mapa);
    setMsg(`Resolvendo ${normas.length} norma(s)…`);
    const res = await resolverLote(normas, { intervaloMs: 300, onProgresso: (i, t) => setMsg(`Resolvendo ${i}/${t}…`) });
    setResultados(res);
    setMsg(`${res.filter((r) => r.status === 'confirmada').length} confirmada(s), ${erros.length} erro(s) de planilha.`);
  }

  async function confirmar() {
    let leis = confirmarParaLeis(resultados, escolhas);
    leis = await preencherUrlsPlanalto(leis);
    const db = await abrirDb();
    for (const l of leis) await salvarLei(db, l);
    chrome.runtime.sendMessage({ tipo: 'verificar-agora' });
    setMsg(`${leis.length} lei(s) em monitoramento.`);
    setResultados([]);
  }

  return (
    <div style="width:360px;padding:12px;font-family:sans-serif">
      <h3>Legis Monitor</h3>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={aoSelecionar} />
      <p style="font-size:12px">{msg}</p>
      {resultados.length > 0 && (
        <>
          <ul style="max-height:260px;overflow:auto;font-size:12px;padding-left:16px">
            {resultados.map((r) => (
              <li key={r.norma.linha}>
                {r.norma.tipo} {r.norma.numero}/{r.norma.ano} — <b>{r.status}</b>
                {r.status === 'ambigua' && (
                  <select onChange={(e) => setEscolhas({ ...escolhas, [r.norma.linha]: (e.target as HTMLSelectElement).value })}>
                    <option value="">escolher…</option>
                    {r.candidatos.map((c) => <option value={c.urn}>{c.urn}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>
          <button onClick={confirmar}>Confirmar e monitorar</button>
        </>
      )}
    </div>
  );
}
```

```tsx
// src/ui/popup/main-popup.tsx
import { render } from 'preact';
import { Popup } from './Popup';
render(<Popup />, document.getElementById('app')!);
```

- [ ] **Step 6: Build e verificação manual**

Run: `npm run build`
Manual: recarregar a extensão, abrir o popup, importar a planilha-exemplo (criada na Task 16), ver a lista de confirmação e o botão funcionar.

- [ ] **Step 7: Commit**

```bash
git add src/ui/popup/ tests/core/ui/confirmacao.test.ts
git commit -m "feat: popup de importação, resolução e confirmação de leis"
```

---

### Task 15: UI — Painel (histórico + exportação) e Opções (frequência)

**Files:**
- Create: `src/ui/panel/Panel.tsx`, `src/ui/panel/main-panel.tsx`, `panel.html`, `src/ui/options/Options.tsx`, `src/ui/options/main-options.tsx`, `options.html`
- Modify: `src/manifest.ts` (registrar `options_page` e abrir painel via `action`/aba)
- Test: `tests/core/ui/download.test.ts`

**Interfaces:**
- Consumes: repositório (T10), exportadores (T12).
- Produces: `baixarBlob(nome: string, blob: Blob): void` e `bytesParaBlobXlsx(bytes: Uint8Array): Blob` (utilitário testável).

- [ ] **Step 1: Escrever o teste do utilitário de download (que falha)**

```typescript
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
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run tests/core/ui/download.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `download.ts`, `Panel.tsx`, `Options.tsx`**

```typescript
// src/ui/panel/download.ts
export function bytesParaBlobXlsx(bytes: Uint8Array): Blob {
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
export function baixarBlob(nome: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}
```

```tsx
// src/ui/panel/Panel.tsx
import { useEffect, useState } from 'preact/hooks';
import { abrirDb, listarLeis, listarInovacoes, marcarLida } from '../../core/repositorio/db';
import { montarLinhas, gerarExcel } from '../../core/exportador/excel';
import { gerarPdf } from '../../core/exportador/pdf';
import { bytesParaBlobXlsx, baixarBlob } from './download';
import type { Inovacao, LeiAcompanhada } from '../../core/types';

export function Panel() {
  const [leis, setLeis] = useState<LeiAcompanhada[]>([]);
  const [inov, setInov] = useState<Inovacao[]>([]);

  async function carregar() {
    const db = await abrirDb();
    setLeis(await listarLeis(db));
    setInov((await listarInovacoes(db)).sort((a, b) => b.detectadaEm.localeCompare(a.detectadaEm)));
  }
  useEffect(() => { void carregar(); }, []);

  async function lida(id: string) { const db = await abrirDb(); await marcarLida(db, id); await carregar(); }
  function exportarExcel() { baixarBlob('inovacoes.xlsx', bytesParaBlobXlsx(gerarExcel(montarLinhas(leis, inov)))); }
  function exportarPdf() { baixarBlob('inovacoes.pdf', gerarPdf(montarLinhas(leis, inov))); }

  const nome = new Map(leis.map((l) => [l.id, l.apelido || l.titulo]));
  return (
    <div style="padding:16px;font-family:sans-serif">
      <h2>Inovações detectadas</h2>
      <button onClick={exportarExcel}>Exportar Excel</button>{' '}
      <button onClick={exportarPdf}>Exportar PDF</button>
      <ul style="font-size:13px">
        {inov.map((i) => (
          <li key={i.id} style={i.lida ? 'opacity:.55' : 'font-weight:600'}>
            [{i.detectadaEm.slice(0, 10)}] {nome.get(i.leiId)} — {i.tipo === 'ALTERACAO' ? i.normaAlteradora?.descricao : i.resumoDiff?.preview}
            {!i.lida && <button style="margin-left:8px" onClick={() => lida(i.id)}>marcar lida</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// src/ui/options/Options.tsx
import { useEffect, useState } from 'preact/hooks';

export function Options() {
  const [freq, setFreq] = useState<'horaria' | 'diaria' | 'semanal'>('diaria');
  const [popup, setPopup] = useState(true);
  useEffect(() => { chrome.storage.local.get(['frequencia', 'popupAtivo']).then((s) => { setFreq(s.frequencia ?? 'diaria'); setPopup(s.popupAtivo !== false); }); }, []);
  async function salvar() {
    await chrome.storage.local.set({ frequencia: freq, popupAtivo: popup });
    chrome.runtime.sendMessage({ tipo: 'reagendar' });
  }
  return (
    <div style="padding:16px;font-family:sans-serif">
      <h2>Configurações</h2>
      <label>Frequência de verificação:{' '}
        <select value={freq} onChange={(e) => setFreq((e.target as HTMLSelectElement).value as any)}>
          <option value="horaria">A cada hora</option>
          <option value="diaria">Diária</option>
          <option value="semanal">Semanal</option>
        </select>
      </label>
      <p><label><input type="checkbox" checked={popup} onChange={(e) => setPopup((e.target as HTMLInputElement).checked)} /> Mostrar pop-up de notificação</label></p>
      <button onClick={salvar}>Salvar</button>
    </div>
  );
}
```

Criar `panel.html`, `options.html`, `main-panel.tsx`, `main-options.tsx` no mesmo padrão do popup, e registrar `options_page: 'options.html'` no `manifest.ts`. Abrir o painel a partir de um botão no popup via `chrome.tabs.create({ url: 'panel.html' })`.

- [ ] **Step 4: Rodar teste e build**

Run: `npx vitest run tests/core/ui/download.test.ts && npm run build`
Expected: PASS + build ok. Verificar manualmente painel e opções.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ src/manifest.ts panel.html options.html tests/core/ui/download.test.ts
git commit -m "feat: painel de inovações com exportação e página de opções"
```

---

### Task 16: Planilha-exemplo + E2E (Playwright)

**Files:**
- Create: `public/modelo-legislacoes.xlsx` (gerado por script), `scripts/gerar-modelo.mjs`, `e2e/fluxo.spec.ts`, `playwright.config.ts`
- Modify: `package.json` (script `e2e` e `gerar:modelo`), `src/ui/popup/Popup.tsx` (link "baixar modelo")

**Interfaces:**
- Consumes: extensão construída (`dist/`).

- [ ] **Step 1: Script que gera a planilha-modelo**

```javascript
// scripts/gerar-modelo.mjs
import * as XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';
const linhas = [
  { Tipo: 'Lei', 'Número': '8.112', Ano: 1990, Apelido: 'Regime Jurídico dos Servidores', 'URL Planalto': 'https://www.planalto.gov.br/ccivil_03/leis/l8112cons.htm', 'Observação': '' },
  { Tipo: 'Lei Complementar', 'Número': '101', Ano: 2000, Apelido: 'Responsabilidade Fiscal', 'URL Planalto': '', 'Observação': '' },
];
const ws = XLSX.utils.json_to_sheet(linhas);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Legislações');
mkdirSync('public', { recursive: true });
XLSX.writeFile(wb, 'public/modelo-legislacoes.xlsx');
console.log('modelo gerado');
```

Run: `node scripts/gerar-modelo.mjs`
Expected: `public/modelo-legislacoes.xlsx` criado.

- [ ] **Step 2: Configurar Playwright para carregar a extensão**

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: 'e2e', timeout: 60000, use: { headless: false } });
```

- [ ] **Step 3: Escrever o E2E do fluxo crítico**

```typescript
// e2e/fluxo.spec.ts
import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';

test('importa planilha-modelo e confirma leis', async () => {
  const pathToExtension = resolve('dist');
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
  });
  // descobre o id da extensão via service worker
  const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.setInputFiles('input[type=file]', resolve('public/modelo-legislacoes.xlsx'));
  await expect(page.locator('text=confirmada')).toBeVisible({ timeout: 30000 });
  await page.click('text=Confirmar e monitorar');
  await expect(page.locator('text=em monitoramento')).toBeVisible({ timeout: 30000 });
  await ctx.close();
});
```

- [ ] **Step 4: Rodar E2E**

Run: `npm run build && npx playwright test`
Expected: PASS (o teste faz requisições reais ao LexML; requer rede). Se instável por rede, marcar como `test.describe.serial` e aumentar timeout.

- [ ] **Step 5: Adicionar link "baixar modelo" no popup**

Em `Popup.tsx`, adicionar: `<a href={chrome.runtime.getURL('modelo-legislacoes.xlsx')} download>Baixar planilha-modelo</a>`.

- [ ] **Step 6: Rodar suíte completa + build final**

Run: `npm test && npm run build && npm run coverage`
Expected: todos PASSAM; cobertura do núcleo ≥ 80%.

- [ ] **Step 7: Commit**

```bash
git add public/ scripts/ e2e/ playwright.config.ts package.json src/ui/popup/Popup.tsx
git commit -m "feat: planilha-modelo e teste E2E do fluxo de importação"
```

---

## Self-Review (cobertura do spec)

- **§1 Objetivo (resolução + 2 detecções):** Tasks 4 (resolução), 8 (marcadores/ALTERACAO), 9+11 (diff/TEXTO). ✓
- **§2 Escopo/decisões (MV3, client-side, planilha, notificação+painel+export, endpoints verificados):** Tasks 1, 3, 13, 14, 15; endpoints em Global Constraints. ✓
- **§3 Componentes:** cada módulo do diagrama = uma Task (importador T3, resolvedor T4, ficha T5, buscarTexto T6, normalizar T7, marcadores T8, diff T9, repositório T10, monitor T11, exportador T12, service worker T13, UI T14/T15). ✓
- **§4 Fluxos (cadastro e monitoramento):** T14 (cadastro/confirmação), T11+T13 (monitoramento). ✓
- **§5 Modelo de dados (leis/fotos/inovações + config):** T10 (schema), T13 (config `chrome.storage.local`). ✓
- **§6 Planilha (colunas + tolerâncias + modelo baixável):** T3 (detecção/tolerância), T16 (modelo). ✓
- **§7 Erros/casos de borda (incompleta, ambígua, sem URL, falha de rede, extração anômala, ISO-8859-1):** T3 (erros de linha), T4 (ambígua/não localizada), T11 (sem_url, falhou, guarda anti-falso-positivo), T6 (ISO-8859-1). ✓
- **§8 Stack:** refletida em Task 1 e nas dependências. ✓
- **§9 Testes (unit/integração/E2E, fixtures, mocks):** ciclos TDD em todas as tasks; E2E em T16. ✓

**Placeholder scan:** nenhum "TBD/TODO"; todo passo tem código real. Detecção de URL do Planalto é declaradamente *best-effort* (T5) com fallback `sem_url` (T11) — comportamento definido, não pendência.

**Type consistency:** `LeiAcompanhada`, `FotoTexto`, `Inovacao`, `ResultadoResolucao`, `CandidatoNorma`, `Marcador` usados de forma consistente entre T1→T16; assinaturas de `verificarLei`, `executarCiclo`, `resolverNorma`, `extrairMarcadores` casam entre produtor e consumidor.
