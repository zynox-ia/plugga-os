# Roadmap — Plugga OS (Plugga / Waze Energia)

- **Destino:** reunir em um sistema interno do ecossistema Plugga/Waze os clientes, propostas, financeiro, equipe, compras, engenharia, eletromobilidade, ferramentas e interfaces API/MCP.
- **Recorte desta versão:** somente a Fundação. Uma issue é executada e verificada por vez.
- **Time no Linear:** [Plugga OS (`PLU`)](https://linear.app/zynox-dev/team/PLU/all).
- **Versão em produção:** não identificada por tag `vX.Y.Z` no repositório. O [README](../../README.md) registra autenticação, estudos de eficiência energética e e-mail transacional em produção; esta revisão não verificou o ambiente de produção.
- **Última revisão:** 2026-10-10.

## Perfis e fluxo principal

Os perfis, suas ações principais e o fluxo de negócio completo ainda precisam de definição com o André. A etapa atual fecha a base operacional antes de planejar as capacidades de negócio.

## Estado encontrado

| Situação | Evidência |
|---|---|
| Base implementada | Login e gestão de usuários em `apps/api/src/auth/`; clientes, comercial, energia, compras e obras têm rotas de API e modelos em `apps/api/prisma/schema.prisma`. O [README](../../README.md) registra parte do sistema em produção. |
| Fundação incompleta | A [Spec 001](../../specs/001-migracao-storage-seaweedfs/tasks.md) ainda tem tarefas abertas; a [Spec 002](../../specs/002-fundacao-solida/tasks.md) também. As issues da Fundação permanecem pendentes, conforme confirmação do André em 2026-10-10. |
| Capacidades futuras | Financeiro, Engenharia e PluggaMob exibem telas de espera em `apps/web/app/`; não foi identificado um servidor MCP em `apps/` ou `packages/`. A existência de rotas ou modelos não comprova um fluxo completo em produção. |

## Projeto ativo: [PLU] Fundação

[Projeto no Linear](https://linear.app/zynox-dev/project/plu-fundacao-414aa82b1869) · **Status:** In Progress · **Depende de:** —

**Objetivo:** concluir e verificar a base operacional, o isolamento de dados e acessos por empresa e a sustentação do Plugga OS antes de avançar para o produto unificado.

**Critério de pronto:** publicação e restauração **local** comprovadas; registros e permissões respeitam a empresa; deploy, monitoramento, CI e testes de integração verificados; aceite em produção registrado pelo André. A cópia externa e a recuperação após perda total da VPS foram adiadas pela Spec 002 e não fazem parte deste aceite.

**Fora de escopo desta versão:** novas funcionalidades de clientes, propostas, financeiro, equipe, compras, engenharia, eletromobilidade, integrações externas e API/MCP.

| Milestone | Critério de saída | Trabalho existente | Estado em 2026-10-10 |
|---|---|---|---|
| **Alpha** | Ensaio local, SeaweedFS, backup com **restore local** e retirada do MinIO verificados; pendências de publicação e rotas fechadas por padrão conferidas. | [Spec 001](../../specs/001-migracao-storage-seaweedfs/spec.md); [Spec 002, fatia 1](../../specs/002-fundacao-solida/spec.md). [PLU-262](https://linear.app/zynox-dev/issue/PLU-262/infra-checkpoint-a-ensaio-local-completo-e-revisao), [PLU-260](https://linear.app/zynox-dev/issue/PLU-260/infra-checkpoint-b-seaweedfs-na-vps-verificado), [PLU-238](https://linear.app/zynox-dev/issue/PLU-238/infra-t9-remover-o-minio-e-documentar). | Aberto; checkpoints e tarefas da Spec 002 ainda pendentes. |
| **Beta** | Dados de negócio e acessos isolados por empresa; migrations reversíveis, equivalência de alcance e integridade verificadas. | [Spec 002, fatias 2 e 3](../../specs/002-fundacao-solida/spec.md), incluindo [PLU-133](https://linear.app/zynox-dev/issue/PLU-133/infra-spec-002-us4-cada-registro-tem-empresa-e-o-acesso-respeita-o), que bloqueia a Spec 003. | Aberto; história de escopo por empresa pendente. |
| **GA** | Publicação reversível, observabilidade, CI, testes de integração, documentação e verificação final aprovados em produção. | [Spec 002, fatia 4](../../specs/002-fundacao-solida/spec.md). | Aberto; aceite final não registrado. |

### Fila de execução

1. **Próxima issue única:** [PLU-262 — ensaio local completo e revisão](https://linear.app/zynox-dev/issue/PLU-262/infra-checkpoint-a-ensaio-local-completo-e-revisao). Confirmar seus checks e encerrá-la antes de despachar outra.
2. **Próxima candidata:** [PLU-260 — SeaweedFS na VPS verificado](https://linear.app/zynox-dev/issue/PLU-260/infra-checkpoint-b-seaweedfs-na-vps-verificado), após PLU-262. Antes de encerrá-la, revisar com André o check de igualdade de objetos com T4: a decisão de iniciar o SeaweedFS vazio exige outra evidência de aceite, ainda a definir. Confirmar leitura, escrita e restore local sem presumir equivalência de contagem.
3. **Depois:** [PLU-238 — remover o MinIO e documentar](https://linear.app/zynox-dev/issue/PLU-238/infra-t9-remover-o-minio-e-documentar). Ainda requer CI do corpus contra SeaweedFS, retirada dos contêineres e volume após a retenção, registro no GUIA e 24 horas de saúde posterior. A ação na VPS segue os gates de produção. Em seguida, auditar as pendências da Spec 002 por fatia e escolher uma issue por vez.

O [PLU-1](https://linear.app/zynox-dev/issue/PLU-1/infra-spec-002-fundacao-solida-do-plugga-os-seguranca-arquitetura-e) é o índice histórico da Spec 002, não uma issue para despacho. O estado `In Progress` desse índice e de várias sub-issues antigas será reconciliado com a execução sequencial, sem concluir trabalho apenas pelo status do Linear.

### Organização pendente no Linear

A Fundação tem sete milestones legados (`Fase 1–3` e `Spec 002 — Fatia 1–4`), além de `Alpha`, `Beta` e `GA`. As issues ainda estão nos milestones legados; os três novos aparecem sem progresso. Antes de mover ou apagar qualquer milestone, conferir a correspondência de cada issue com os critérios acima e aprovar uma tabela `atual → padrão` com o André. Esta revisão não altera issues, status ou milestones.

## Decisões e perguntas pendentes

- Revisão técnica da [ADR-0013](../adr/0013-empresa-como-atributo-modulos-compartilhados.md) (T007 da Spec 002) antes de iniciar PLU-133.
- Confirmar as ações do dono e as verificações de produção ainda abertas nas Specs 001 e 002. Backup externo, retenção e ensaio de desastre foram adiados pelo PR #46; a Spec 002 registra o risco de perda total se a VPS for perdida. O escopo e a numeração da futura spec continuam por decidir.
- Definir perfis, fluxo principal, ordem e critérios das capacidades de negócio após a Fundação.
- Resolver a configuração da porta de teste e do usuário de teste registrada em [projeto.md](../../.specify/memory/projeto.md) antes de executar o Condutor nesse ambiente.

## Horizonte após a Fundação

Já existem no Linear [Produto unificado](https://linear.app/zynox-dev/project/plu-produto-unificado-e64435a421c5), [Integrações operacionais](https://linear.app/zynox-dev/project/plu-integracoes-operacionais-47d73a0230d4) e [Eletromobilidade](https://linear.app/zynox-dev/project/plu-eletromobilidade-092569f7d0cd). Eles permanecem fora da fila desta versão. Clientes, propostas, financeiro, equipe, compras, engenharia, ferramentas e API/MCP fazem parte do destino informado pelo André; seus projetos e specs serão definidos em revisão posterior.
