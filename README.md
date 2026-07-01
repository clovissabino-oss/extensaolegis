# Extensão Legis Monitor

Extensão de navegador (Chrome/Edge) que monitora legislação federal brasileira e avisa
sempre que uma lei acompanhada sofre uma **inovação** — seja uma **norma nova que a
altera** (via LexML) ou uma **mudança no texto compilado** do Planalto.

## Como funciona (visão geral)

1. Você importa uma **planilha** com a relação de leis a acompanhar.
2. A extensão resolve cada norma (via LexML) e mostra uma tela de **confirmação**.
3. Em segundo plano (com o navegador aberto), verifica periodicamente duas fontes:
   - **LexML Brasil** — normas que alteram a lei ("alterado por").
   - **Texto compilado do Planalto** — mudança de redação (diff).
4. Ao detectar uma inovação: **notificação do navegador** + item no **painel**.
5. Você pode **exportar** o histórico em Excel ou PDF.

Arquitetura 100% client-side (sem servidor, dados locais).

## Documentação

- [Documento de design](docs/superpowers/specs/2026-07-01-extensao-legis-monitor-design.md)

## Status

🚧 Em planejamento — design aprovado, plano de implementação a seguir.
