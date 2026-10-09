# Changelog do fluxo

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) · Versão: [SemVer](https://semver.org/lang/pt-BR/).
Cada versão lista também a **ação necessária nos projetos**, quando houver.

## [1.3.0] — 2026-10-09
### Adicionado
- Roteamento de modelos por papel em `.traycer/agent-selection-guide.md` (modelo em `docs/fluxo/modelos/`), lido pelo Traycer ao criar agentes: Diretores e auxiliares com Terra Medium (reserva Sonnet 5.5); fase plan com Sol Max (reserva Opus 5); demais agentes de fase com Luna Max (reserva Haiku 4.5); revisor independente sempre com o modelo que não implementou. Nenhum modelo fora da tabela sem pedido do André.
- Guia 07, seção 6: modelos por papel.
### Alterado
- Coordenador (v6) e Diretor (v4) criam cada agente com o modelo da tabela e registram o modelo usado. Atualização do fluxo (v4) instala o guia.
### Ação necessária nos projetos
- Rodar o `04-atualizar-fluxo.md` do central.
- Conferir no seletor de modelos do Traycer se os nomes da tabela batem com os que aparecem lá.

## [1.2.0] — 2026-10-09
### Alterado
- Nome de projeto: `[<IDENTIFICADOR>] <capacidade>` (ex.: `[BRU] Gestão de clientes`), para reconhecer o cliente em qualquer lista do workspace.
- Projeto é sempre uma capacidade: segurança, qualidade e performance viram specs no projeto que tocam, nunca um projeto próprio.
- Status de projeto: Planned → In Progress (o ativo) → Completed (GA).
- Sistema existente (modo C): milestones já atingidos não recebem issues e são apagados pelo André; milestone sem issues nunca é o ativo (Coordenador v5).
- `planejar-etapas`: a auditoria aponta essas falhas de higiene e ganhou o passo B4, que corrige com o ok do André.
### Ação necessária nos projetos
- Rodar o `04-atualizar-fluxo.md` do central.
- No Traycer, com o fluxo atualizado: `/planejar-etapas auditar e corrigir a higiene do Linear`, aprovar a tabela `atual → padrão`; depois apagar no Linear os milestones que a skill listar.

## [1.1.2] — 2026-10-09
### Corrigido
- Atualização: o 04 (v3) roda sempre a partir do central (link `raw` na `main`), segue o 04 da versão alvo e executa no mesmo PR as migrações marcadas `[04]` no changelog. Atualizar nunca reinstala Spec Kit, constituição, ambiente ou Linear.
- Migração `[04]` da v1.1.0 para projetos já preparados (bloco `projeto` do `AGENTS.md` preenchido a partir do `projeto.md`, sem rodar a preparação).
### Ação necessária nos projetos
- Nenhuma além de atualizar com o link do central.

## [1.1.1] — 2026-10-09
### Corrigido
- Dependência entre projetos: o MCP do Linear não cria essa relação. `planejar-etapas` passa a escrever `Depende de:` na descrição do projeto e no roadmap e a listar para o André criar no Linear.
- Relações *blocked by* entre issues: as skills (`planejar-etapas`, `registrar-linear`, `/nova-issue`) usam o campo `blockedBy`, criam na ordem do roadmap e perguntam quando a issue citada ainda não existe. Coordenador (v4) define "bloqueada" e usa o `ROADMAP.md` para a ordem dos projetos.
### Ação necessária nos projetos
- Rodar o `04-atualizar-fluxo.md` do central.
- No Linear, atualizar a skill pessoal `/nova-issue` com o texto novo.

## [1.1.0] — 2026-10-09
### Adicionado
- `AGENTS.md` na raiz de cada projeto, lido por qualquer agente (Codex direto; Claude Code via `CLAUDE.md` com `@AGENTS.md`). Modelo em `docs/fluxo/modelos/AGENTS.md`, com dois blocos: `projeto` (comandos e regras do projeto) e `dev-workflow` (regras do fluxo, gerenciado pelo 04).
- Guia 09, seção 5: o que entra e o que nunca entra no `AGENTS.md`.
### Alterado
- Os comandos do dia a dia saem do `projeto.md` e passam a viver no `AGENTS.md`; o `projeto.md` guarda resultados da verificação, linha de base, ambiente local e Linear.
- Preparação (v4), fase 4: escreve o bloco `projeto` e o `CLAUDE.md`. Atualização do fluxo (v2): instala e atualiza o bloco `dev-workflow`. Coordenador (v3) confere os dois blocos na abertura. Diretor (v3) copia os comandos do `AGENTS.md`.
### Ação necessária nos projetos
- Rodar o `04-atualizar-fluxo.md` do central.
- `[04]` Projeto já preparado (existe `.specify/memory/projeto.md`): preencher o bloco `projeto` do `AGENTS.md` sem rodar nada.
  - *Projeto*: uma linha do README e a stack do manifesto.
  - *Comandos*: copiar do `projeto.md` (tabela "Comandos de verificação" e linhas "Subir serviços", "Migração/seed local" e "Subir aplicação (develop)" do "Ambiente local"); "Um teste isolado" pelo script de testes do manifesto, ou "ausente".
  - *Regras do projeto*: as regras curtas que já estavam no `AGENTS.md`/`CLAUDE.md` fora dos blocos (o texto antigo sai de fora dos blocos); sem nenhuma, remover a seção.
  - No `projeto.md`: a tabela de comandos vira "## Verificação em <data>" com as colunas Ação · Resultado · Duração (sem o comando), e saem do "Ambiente local" as três linhas movidas.
  - Conferir o portão da seção 4.5 de `01-preparacao-da-casa.md`.

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
