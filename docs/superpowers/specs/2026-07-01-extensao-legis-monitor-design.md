# Design — Extensão Legis Monitor

**Data:** 2026-07-01
**Status:** Aprovado (design) — pendente plano de implementação

## 1. Objetivo

Extensão de navegador (Chrome/Edge) que monitora a legislação federal brasileira e
avisa o usuário sempre que uma lei acompanhada sofre uma **inovação**. A partir de uma
**planilha de leis** importada pelo usuário, a extensão resolve cada norma (via LexML) e
passa a monitorar o **texto compilado do Planalto**, do qual extrai dois tipos de
inovação:

1. **Normas alteradoras** — a partir dos **marcadores inline** do texto compilado
   (`(Redação dada pela Lei nº…)`, `(Incluído pela…)`, `(Revogado pela…)`), que são a
   fonte **autoritativa e estática** de quais normas alteraram a lei.
2. **Mudança de redação** — via **diff** do texto consolidado normalizado entre
   verificações.

> **Nota de validação técnica (2026-07-01):** o endpoint SRU histórico do LexML
> (`/busca/SRU`) foi **desativado** (HTTP 404) e a seção de "relações" da ficha do LexML
> é renderizada por JS/inconsistente — portanto **não** é usada para detectar alterações.
> O LexML é usado apenas para **resolução** (tipo/número/ano → URN canônica) via
> `GET https://www.lexml.gov.br/busca/search?keyword=...` (HTML UTF-8). A detecção de
> inovações vem inteiramente do texto compilado do Planalto (autoritativo).

As inovações detectadas geram **notificação nativa do navegador** + histórico em um
**painel**, com **exportação de relatório** em Excel e PDF.

## 2. Escopo e decisões

Decisões tomadas no brainstorming:

- **Plataforma:** extensão de navegador (Manifest V3). Verificação ocorre com o
  navegador aberto (via `chrome.alarms`); alerta 24/7 com navegador fechado fica como
  evolução futura (exigiria backend — fora de escopo).
- **O que é "inovação":** **ambos** — normas alteradoras **e** mudança de redação, ambas
  extraídas do **texto compilado do Planalto** (marcadores inline + diff). LexML só
  resolve a norma.
- **Cadastro:** **importação em massa por planilha** (`.xlsx`/`.xls`/`.csv`), com tela de
  **confirmação** antes de monitorar.
- **Saída:** **notificação do navegador + painel + exportação** (Excel/PDF).
- **Arquitetura:** **100% client-side** (Abordagem A) — sem servidor, sem custo, dados
  ficam locais. LexML para resolução; texto compilado do Planalto como fonte de
  inovações; projetos comunitários (api-legislacao, LegisCrawler) como referência/fallback
  futuro.
- **Fora de escopo (por ora):** backend/nuvem, notificação por e-mail, tramitação de
  projetos de lei antes de virarem norma, legislação estadual/municipal.

## 3. Arquitetura e componentes

Módulos pequenos e coesos; o núcleo de lógica é agnóstico ao navegador (testável
isoladamente).

```
EXTENSÃO (Chrome/Edge — Manifest V3)

  UI (Popup / Options)          Service Worker (background)
   - importar planilha    <-->   - agendador (chrome.alarms)
   - confirmar leis              - orquestra verificação diária
   - painel de inovações         - dispara chrome.notifications
   - exportar relatório
         |
         v
  Núcleo (lógica)
   - importador de planilha        - resolvedor de normas (LexML /busca/search)
   - detector de marcadores        - monitor de texto compilado (Planalto) + diff
   - exportador (xlsx/pdf)         - repositório (IndexedDB)
         |                                  |
         v                                  v
   LexML /busca/search (HTML)       Planalto (HTML compilado, ISO-8859-1)
```

**Responsabilidades:**

- **UI (popup + página de opções):** importar planilha; tela de confirmação; painel com
  histórico por lei; botões de exportação; configurações (frequência, pop-up on/off).
- **Service worker:** agenda a verificação (padrão 1x/dia) e emite notificações.
- **Importador de planilha:** lê Excel/CSV no navegador (SheetJS); extrai tipo/número/ano.
- **Resolvedor de normas (LexML):** consulta `/busca/search` e extrai a URN canônica do
  primeiro resultado federal correspondente; alimenta a tela de confirmação.
- **Detector de marcadores:** extrai do texto compilado o conjunto de marcadores de
  alteração (`(Redação dada pela…)`, `(Incluído pela…)`, `(Revogado pela…)`) e detecta
  marcadores novos entre verificações (normas alteradoras).
- **Monitor de texto compilado (Planalto):** baixa o HTML (decodifica ISO-8859-1),
  normaliza e compara o hash com a última "foto" salva (diff).
- **Exportador:** gera relatório em Excel e PDF.
- **Repositório (IndexedDB):** persiste leis, fotos de texto e histórico de inovações.

## 4. Fluxos de dados

### 4.1 Cadastro (importação → confirmação)

```
Upload da planilha
  -> [importador] lê linhas -> {tipo, número, ano, apelido?, urlPlanalto?}
  -> [resolvedor LexML] por linha:
       - única       -> "confirmada"
       - vários      -> "ambígua" (usuário escolhe / cola link do Planalto)
       - nenhuma     -> "não localizada" (cadastro manual só com URL, se quiser)
  -> Tela de confirmação (3 status)
  -> usuário confirma
  -> [repositório] salva leis + captura 1ª "foto" do texto compilado
```

Nada entra no monitoramento sem confirmação do usuário.

### 4.2 Monitoramento (verificação periódica → notificação)

```
chrome.alarms dispara (ex.: 1x/dia)
  -> para cada lei acompanhada (que tem urlPlanalto):
       baixa o texto compilado (decodifica ISO-8859-1), normaliza
       [detecção A] extrai o conjunto de marcadores de alteração;
                    marcador novo (não visto antes) -> inovação (ALTERACAO)
       [detecção B] compara hash do texto normalizado com a última foto;
                    hash mudou -> inovação (TEXTO) + guarda nova foto
  -> houve inovação nova?
       sim -> grava histórico -> chrome.notifications + badge (contador)
       não -> silencioso
  -> painel mostra inovações "novas"; usuário pode exportar
```

Uma única requisição ao Planalto por lei alimenta as duas detecções. Cada inovação
registra sua origem (marcador de alteração vs diff de texto). Leis sem `urlPlanalto`
(não resolvidas para um texto compilado) ficam sinalizadas e não entram na verificação
até o usuário informar a URL.

## 5. Modelo de dados (IndexedDB, local)

### `leisAcompanhadas`
```
{
  id:           "urn:lex:br:federal:lei:1990-12-11;8112",  // URN LexML (chave)
  tipo:         "Lei",
  numero:       "8.112",
  ano:          1990,
  apelido:      "Regime Jurídico dos Servidores",   // opcional (da planilha)
  urlPlanalto:  "https://www.planalto.gov.br/.../l8112cons.htm",
  status:       "ativa",                            // ativa | pausada
  adicionadaEm: "2026-07-01T12:00:00Z",
  ultimaVerif:  "2026-07-01T12:00:00Z"
}
```

### `fotosTexto`
```
{
  leiId:       "urn:lex:...;8112",
  capturadaEm: "2026-07-01T12:00:00Z",
  hash:        "sha256:ab34…",       // detecta mudança sem comparar texto inteiro
  textoNorm:   "…texto normalizado…",// base para o diff legível
  tamanho:     48213
}
```
Guarda a foto mais recente por lei (opcionalmente a anterior, para "antes/depois").
Recomputa diff só quando o hash muda.

### `inovacoes` (append-only)
```
{
  id:          "inv_000123",
  leiId:       "urn:lex:...;8112",
  tipo:        "ALTERACAO" | "TEXTO",   // origem: marcador inline ou diff do Planalto
  detectadaEm: "2026-07-01T12:00:00Z",
  lida:        false,                    // controla "novo" e badge

  // tipo = ALTERACAO (marcador inline do texto compilado):
  normaAlteradora: { descricao, tipoMarcador },  // ex.: "Lei nº 14.xyz, de 2026" / "REDACAO"

  // tipo = TEXTO:
  resumoDiff: { trechosAdicionados, trechosRemovidos, preview }
}
```

### Configurações (`chrome.storage.local`)
Frequência da verificação (**configurável já no MVP**, padrão diária), pop-up on/off,
formato de export preferido, mapeamento de colunas memorizado.

**Notas:**
- A **URN do LexML** é a chave única; resolve variações de escrita da mesma lei na
  planilha (normalizadas na importação).
- Histórico **append-only** garante relatório fiel.
- Volume pequeno (dezenas/centenas de leis, poucos KB por texto) — IndexedDB é suficiente.

## 6. Modelo da planilha de importação

Escopo: legislação **federal**. Trio mínimo para resolução via LexML.

| Coluna | Obrigatória | Descrição |
|---|---|---|
| Tipo | Sim | Lei, Lei Complementar, Decreto, Decreto-Lei, Medida Provisória, Emenda Constitucional, etc. |
| Número | Sim | Aceita `8.112`, `8112`, `nº 8.112`. |
| Ano | Sim | Ano da norma (ex.: 1990). |
| Apelido | Não | Texto livre; aparece no painel/relatório. Se vazio, preenchido com o nome oficial. |
| URL Planalto | Não | Desempate para ambíguas e plano B (monitorar só texto quando norma não está no LexML). |
| Observação | Não | Anotação do usuário; ignorada no monitoramento, opcional no relatório. |

**Tolerâncias:** ordem/nome das colunas livres (tela de mapeamento memoriza a escolha);
abreviações comuns (`LC`, `MP`, `EC`, `Dec.`); formatos `.xlsx`, `.xls`, `.csv`. Uma
planilha-exemplo fica disponível para download dentro da extensão.

## 7. Tratamento de erros e casos de borda

### Importação
- Colunas fora do padrão → tela de mapeamento com preview.
- Linha incompleta → "não localizada" (com motivo); não trava o restante.
- Ambígua → usuário escolhe candidato ou cola link do Planalto.
- Inexistente no LexML → cadastro manual só com URL (monitora só texto compilado).
- Planilha grande → processamento em lotes com barra de progresso.

### Monitoramento (fontes externas)
- LexML fora do ar/timeout → marca falha temporária da fonte, mantém histórico, retenta
  com backoff.
- Planalto mudou de layout → extração vazia/anômala **não** vira falso "texto mudou";
  sinaliza "não consegui ler o texto desta lei".
- Página fora do ar → falha temporária, mantém última foto, retenta.
- Mudança trivial (espaços/encoding) → normalizador remove ruído antes do hash (evita
  falso positivo).
- Rate limiting → fila com intervalo entre leis, respeitando os serviços públicos.

### Princípios transversais
- **Falha isolada:** erro em uma lei/fonte não contamina as demais.
- **Sem falso positivo de inovação:** melhor não avisar do que avisar errado.
- **Transparência:** painel mostra status da última verificação por fonte (ok/falhou/pausada).
- **Permissões mínimas:** host permissions só para `lexml.gov.br` e `planalto.gov.br`.

## 8. Stack técnica

- **Manifest V3** (service worker).
- **TypeScript** (segurança de tipos sobre o HTML externo do LexML e do Planalto).
- **UI:** Preact + Vite (bundle pequeno) — **decidido**.
- **Planilha:** SheetJS (xlsx) para leitura e geração.
- **PDF:** jsPDF.
- **Parsing de HTML:** `DOMParser` nativo (resultados do LexML e texto do Planalto).
- **Decodificação ISO-8859-1:** `TextDecoder('iso-8859-1')` sobre o `ArrayBuffer` do
  Planalto (o texto compilado **não** é UTF-8).
- **Armazenamento:** IndexedDB via camada fina (`idb`).
- **Diff:** biblioteca pequena (`diff`) para "antes/depois".

## 9. Estratégia de testes (AAA, cobertura mínima 80%)

- **Unitários** (núcleo):
  - importador: colunas fora de ordem, número com/sem ponto, linhas incompletas.
  - resolvedor LexML: extrai URN do primeiro resultado federal; múltiplos candidatos;
    zero resultados (fixtures HTML do `/busca/search`).
  - detector de marcadores: extrai o conjunto de marcadores; marcador novo detectado,
    repetido não duplica (fixtures HTML do Planalto).
  - normalizador + diff: mudança trivial não gera inovação; mudança real gera.
- **Integração:** importar → confirmar → salvar; verificar → registrar → marcar não-lida.
- **E2E (fluxo crítico):** carregar extensão, importar planilha-exemplo, confirmar,
  simular verificação, ver notificação + item no painel (Playwright com extensão).
- **Fontes externas sempre mockadas** (fixtures HTML de LexML e Planalto).

## 10. Fontes de referência (pesquisa)

- LexML Brasil — Rede oficial: https://www.lexml.gov.br/
- LexML — Dados Abertos: https://projeto.lexml.gov.br/open-data
- LexML — Acervo (Dados Abertos, Senado): https://www12.senado.leg.br/dados-abertos/legislativo/legislacao/acervo-do-portal-lexml
- Wrapper Python (referência de uso da API): https://github.com/netoferraz/py-lexml-acervo
- Portal da Legislação (Planalto): https://www4.planalto.gov.br/legislacao
- LegisCrawler.br (referência de parsing do Planalto): https://github.com/russoedu/LegisCrawler.br
- api-legislacao (referência/fallback): https://github.com/felvieira/api-legislacao
- Dados Abertos Câmara: https://dadosabertos.camara.leg.br/swagger/api.html
- Dados Abertos Senado: https://legis.senado.leg.br/dadosabertos/api-docs/swagger-ui/index.html
- Ro-DOU (modelo de clipping/notificação, evolução futura): https://gestaogovbr.github.io/Ro-dou/

## 11. Evolução futura (fora do escopo atual)

- Backend serverless para verificação 24/7 (navegador fechado) e notificação por e-mail.
- Acompanhamento de tramitação (Câmara/Senado) antes de a norma ser publicada.
- Legislação estadual/municipal (LexML + Querido Diário).
