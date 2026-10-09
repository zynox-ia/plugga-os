# 08 · Glossário

| Termo | Significado |
|---|---|
| **AGENTS.md** | Arquivo na raiz do repositório com regras e comandos que qualquer agente (Claude Code, Codex) lê ao abrir o projeto. O `CLAUDE.md` só o importa |
| **Agente de fase** | Agente criado pelo Diretor para executar uma única fase (specify, plan, implement…) e arquivado ao terminar |
| **Alpha / Beta / GA** | Milestones padrão de todo projeto: fluxo de ponta a ponta / escopo completo validado / em produção (*General Availability*) |
| **Back-merge** | Levar uma correção feita na `main` (hotfix) de volta para a `develop` |
| **Branch** | Linha paralela de histórico no git; cada issue tem a sua |
| **Changelog** | Lista de mudanças de cada versão, em `CHANGELOG.md` |
| **Constituição** | Princípios do projeto (`.specify/memory/constitution.md`) que todo plano e revisão respeitam |
| **Conventional Commits** | Padrão de mensagem de commit `tipo(escopo): resumo` (feat, fix, refactor…) |
| **Coordenador** | Agente que abre a sessão, audita o projeto, cria os Diretores e distribui as issues |
| **Critério de aceite** | Condição verificável de que a issue está pronta, no formato Dado / Quando / Então |
| **Develop** | Branch de integração; tudo aprovado entra aqui antes de ir para produção |
| **Diretor** | Agente que gere uma issue com seu time; existem três (01, 02, 03) |
| **Domínio** | Área de negócio do sistema (Clientes, Funil, Financeiro); vira label e escopo do commit |
| **Esqueleto andante** | Primeira versão mínima do fluxo principal, ligando tudo de ponta a ponta |
| **Estimate** | Tamanho da issue no Linear (XS, S, M, L, XL); define a trilha |
| **Fatia vertical** | Unidade de trabalho que entrega algo testável na tela, do banco à interface |
| **Hotfix** | Correção urgente de um defeito em produção, feita a partir da `main` |
| **Issue avulsa** | Issue sem spec: bug, hotfix ou mudança XS/S |
| **Issue pai** | Issue que representa uma spec do Spec Kit; tem sub-issues |
| **Linha de base** | Falhas de teste que já existiam antes de qualquer issue, registradas na preparação |
| **Main** | Branch de produção |
| **Merge / Squash merge** | Incorporar uma branch em outra / incorporando todos os commits como um só |
| **Milestone** | Portão de maturidade dentro de um projeto do Linear |
| **Portão** | Verificação objetiva por comando que libera a passagem de uma fase para a seguinte |
| **Projeto** | Capacidade do produto no Linear (ex.: Gestão de clientes), com milestones e specs |
| **Pull Request (PR)** | Pedido de incorporação de uma branch, com revisão |
| **Release** | Publicação de uma versão em produção: merge `develop → main` + tag |
| **Revisor independente** | Agente que julga o trabalho sem ter participado dele e sem corrigir nada |
| **SDD** | *Spec-Driven Development*: especificar antes de implementar |
| **SemVer** | Versão `MAJOR.MINOR.PATCH`: incompatível / nova capacidade / correção |
| **Severity** | Gravidade de um bug: S1 (produção parada) a S4 (cosmético) |
| **Spec** | Especificação do Spec Kit (`specs/NNN-nome/`); no Linear, a issue pai |
| **Sub-issue** | Fase ou user story do `tasks.md` de uma spec |
| **Trilha** | Caminho de execução de uma issue: SDD, rápida ou bug |
| **User story (US)** | Comportamento entregue a um usuário, independente e testável |
| **Verifying** | Status em que você valida a issue no seu ambiente local |
| **Worktree** | Pasta de trabalho extra ligada ao mesmo repositório, com outra branch aberta |
