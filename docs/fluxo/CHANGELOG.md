# Changelog do fluxo

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) · Versão: [SemVer](https://semver.org/lang/pt-BR/).
Cada versão lista também a **ação necessária nos projetos**, quando houver.

## [1.1.0] — 2026-10-09
### Adicionado
- `AGENTS.md` na raiz de cada projeto, lido por qualquer agente (Codex direto; Claude Code via `CLAUDE.md` com `@AGENTS.md`). Modelo em `docs/fluxo/modelos/AGENTS.md`, com dois blocos: `projeto` (comandos e regras do projeto) e `dev-workflow` (regras do fluxo, gerenciado pelo 04).
- Guia 09, seção 5: o que entra e o que nunca entra no `AGENTS.md`.
### Alterado
- Os comandos do dia a dia saem do `projeto.md` e passam a viver no `AGENTS.md`; o `projeto.md` guarda resultados da verificação, linha de base, ambiente local e Linear.
- Preparação (v4), fase 4: escreve o bloco `projeto` e o `CLAUDE.md`. Atualização do fluxo (v2): instala e atualiza o bloco `dev-workflow`. Coordenador (v3) confere os dois blocos na abertura. Diretor (v3) copia os comandos do `AGENTS.md`.
### Ação necessária nos projetos
- Rodar `04-atualizar-fluxo.md`.
- Projetos preparados na v1.0.0: num agente novo, "Siga as seções 4.3 e 4.5 de `docs/fluxo/01-preparacao-da-casa.md`, sem rodar os comandos de novo: use os comandos já registrados no `projeto.md`." Mesclar o PR.

## [1.0.0] — 2026-10-09
### Adicionado
- Convenções: status, prefixos, specs com sub-issues, Alpha/Beta/GA, SemVer, git.
- Prompts: preparação da casa, Diretor, Coordenador, atualização do fluxo.
- Skills: `planejar-etapas`, `registrar-linear`.
- Linear: guidance, templates e skill `/nova-issue`.
- Guias 01 a 09.
### Ação necessária nos projetos
- Instalar com `04-atualizar-fluxo.md` e rodar `01-preparacao-da-casa.md`.
- Configurar o time no Linear (guia 02, seção 7).
