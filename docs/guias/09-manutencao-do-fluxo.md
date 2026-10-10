# 09 · Manutenção do fluxo

O fluxo (guias, prompts, skills e convenções) é usado em vários repositórios de clientes. Para todos usarem a mesma versão e as melhorias chegarem a todos, ele vive num **repositório central** e é copiado para cada projeto com versão.

## 1. Repositório central

O repositório público [`zynox-ia/dev-workflow`](https://github.com/zynox-ia/dev-workflow), com a mesma estrutura que vai para os projetos:

```
dev-workflow/
├── README.md                    como usar e como contribuir
├── AGENTS.md                    regras para agentes que editam o próprio fluxo (não vai para os projetos)
└── docs/
    ├── README.md
    ├── guias/                   documentação explicativa
    └── fluxo/
        ├── VERSION              versão atual (ex.: 1.2.0)
        ├── CHANGELOG.md         o que mudou em cada versão e a ação necessária nos projetos
        ├── 00-convencoes.md … 04-atualizar-fluxo.md
        ├── papeis/              01 Especificador … 09 Verificador
        ├── modelos/             AGENTS.md e agent-selection-guide.md (instalados nos projetos)
        ├── skills/              planejar-etapas, registrar-linear
        └── linear/              guidance, templates e skills do agente do Linear
```

O que **não** fica no central, porque é de cada projeto: `docs/roadmap/`, `.specify/` (constituição, `projeto.md`), `.pipeline/` e o bloco `projeto` do `AGENTS.md`.

Por ser público, qualquer agente baixa o fluxo com `git clone`, sem precisar de autenticação. Por isso, **nunca coloque no fluxo** segredos, dados de clientes ou nomes de sistemas: o conteúdo específico de cada projeto vive no repositório do projeto.

## 2. Versões do fluxo (SemVer)

| Sobe | Quando | Exemplo |
|---|---|---|
| **MAJOR** | Exige reconfigurar projetos: muda status, labels, estrutura do Linear, ou pede para rodar a preparação de novo | Trocar os status do Linear |
| **MINOR** | Capacidade nova, compatível | Nova skill, nova fase opcional |
| **PATCH** | Correção de texto, de comando ou de clareza | Ajustar o arquivo de um papel |

Toda versão tem uma entrada no `CHANGELOG.md`, sempre com a seção **"Ação necessária nos projetos"** (ou "nenhuma").

## 3. Melhorar o fluxo

1. Algo deu errado num projeto (um portão que falhou à toa, um brief confuso, uma pergunta que sempre se repete). Anote.
2. No repositório central, branch `fix/<assunto>` ou `feat/<assunto>`; edite o arquivo; atualize `VERSION` e `CHANGELOG.md`.
3. PR, revisão e merge na `main` do central.
4. Tag `vX.Y.Z` e release no GitHub.
5. Atualize os projetos (seção 4).

Nunca edite `docs/fluxo/` direto num projeto: a mudança some na próxima atualização. Se for urgente, corrija no central e publique um PATCH.

## 4. Instalar ou atualizar num projeto

Num agente novo do Traycer, na pasta do projeto, **sempre com o link do central** (a cópia local do 04 é da versão antiga e não conhece as migrações novas):
```
Leia https://raw.githubusercontent.com/zynox-ia/dev-workflow/main/docs/fluxo/04-atualizar-fluxo.md e siga as instruções neste repositório.
```
O **prompt mestre** lê o repositório, mostra um diagnóstico e faz só o que falta:

| Etapa | Não existe | Existe |
|---|---|---|
| Fluxo | Instala | Atualiza se houver versão nova (com as migrações) |
| Casa (Spec Kit, constituição, comandos, ambiente, Linear) | Prepara do zero | Refaz só as fases que falham |
| Planejamento | Planeja o roadmap | Audita: onde estamos e o que vem |

Fluxo e casa saem num PR único; o roadmap, em outro. Ele para só no plano de ação, nas suas respostas e nos merges. O mesmo prompt serve para projeto novo, projeto existente e atualização.

Na atualização, ele copia `docs/guias/` e `docs/fluxo/` da versão nova, reinstala só as skills do fluxo, atualiza o bloco do fluxo no `AGENTS.md` e executa as migrações `[04]`. Spec Kit, constituição, ambiente e Linear só são refeitos se o diagnóstico mostrar que a fase correspondente falha.

**Ao escrever uma versão nova:** tudo o que os projetos precisam mudar em arquivos e que o 04 consegue fazer sozinho vai no changelog como item `[04]`, com instruções exatas. Rodar a preparação de novo só em MAJOR.

O Condutor avisa na abertura de cada sessão quando o projeto está numa versão mais antiga que a última do central.

## 5. `AGENTS.md` dos projetos

Todo agente que abre o repositório (Claude Code, Codex, um agente de fase, você numa conversa avulsa no Traycer) lê o `AGENTS.md` da raiz antes de qualquer coisa. O Codex lê direto; o Claude Code lê o `CLAUDE.md`, que só contém `@AGENTS.md`. Assim, as regras do fluxo valem até para quem não recebeu um prompt de papel.

O arquivo tem dois blocos, marcados com comentários HTML:

| Bloco | Conteúdo | Quem escreve |
|---|---|---|
| `projeto` | Uma linha sobre o sistema, a tabela de comandos (instalar, subir, migrations, lint, typecheck, testes) e as regras próprias do projeto | A preparação da casa (fase 4); depois, o time, quando um comando muda |
| `dev-workflow` | Regras do fluxo: git, Spec Kit, qualidade, dados e segredos, Linear, onde está cada coisa | O `04-atualizar-fluxo`, a partir de `docs/fluxo/modelos/AGENTS.md`. Nunca editar no projeto |

**O que nunca entra:** descrição da arquitetura, mapa de pastas do código, resumo das features. Isso desatualiza rápido e gasta o contexto de todo agente em toda tarefa; cada agente lê o código que a sua tarefa exige. Limite: menos de 120 linhas.

Mudar uma regra do fluxo = mudar o modelo no central e publicar uma versão. Mudar um comando do projeto = editar o bloco `projeto` num PR do próprio projeto.

## 6. Skills: onde cada uma é usada

| Skill | Onde vive | Quem usa | Para quê |
|---|---|---|---|
| `registrar-linear` | Repositório (`.claude/skills`, `.agents/skills`) | Você no Traycer; o 04 Planejador | Criar demandas no padrão (modo A) e as sub-issues de uma spec (modo B) |
| `planejar-etapas` | Repositório | Você no Traycer; o Condutor (auditoria) | Planejar projetos e specs, auditar, quebrar issues XL |
| `/nova-issue` | Linear (skill pessoal) | Você, conversando com o agente do Linear | O mesmo que o modo A da `registrar-linear`, sem abrir o Traycer |

`registrar-linear` (modo A) e `/nova-issue` seguem as mesmas regras. Ao mudar uma, mude a outra na mesma versão do fluxo. No Linear, atualize a skill pessoal colando o texto novo e salvando de novo.

**No Traycer**, em qualquer agente do projeto: `/registrar-linear bug: a etapa do cliente não salva ao fechar o modal` (Claude Code) ou `$registrar-linear ...` (Codex).
