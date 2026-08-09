# Revisão sênior de 2026-08-09 — o que ficou documentado em vez de corrigido

A revisão de ponta a ponta desta data (8 revisores por subsistema + verificação
adversarial + revisão em nuvem da branch) corrigiu os bugs confirmados de
correção segura. Os itens abaixo foram **deliberadamente deixados de fora** —
por exigirem decisão de produto, migração de banco, ou refatoração com risco
maior que o ganho imediato. Cada um traz o contexto e a correção recomendada,
para não precisar ser redescoberto.

## Correção conhecida, execução adiada

1. **Corrida do último admin** (`team.service.ts`, `assertNotLastAdmin`): a
   checagem lê `listTeam` em memória e a escrita acontece depois, fora de
   transação. Dois rebaixamentos/desativações cruzados e simultâneos (janela de
   milissegundos, exige exatamente 2 admins) deixam a plataforma sem admin.
   Correção: mover checagem+escrita para a mesma transação no repositório, com
   `SELECT ... FOR UPDATE` sobre os papéis de plataforma (ou recontagem com
   rollback); o dublê `in-memory-auth.ts` precisa espelhar a regra.

2. **`agent_actions`: `ON DELETE SET NULL` vs. gatilho append-only** (migração
   `init_foundation`, linhas 124 e 136): o SET NULL da FK dispara um UPDATE que
   o gatilho aborta — deletar um usuário referenciado falharia com erro
   críptico. Hoje inatingível (todo escritor grava `requestedById: null`), mas o
   schema promete o que o banco não cumpre. Decidir UM contrato: FK `RESTRICT` +
   soft-delete de usuário (coerente com append-only), ou cláusula `WHEN` no
   gatilho permitindo só a transição `requested_by → NULL`. Exige migração.

3. **Estudo órfão na retentativa** (`eficiencia/actions.ts`,
   `abrirEstudoPelaFatura`): cria o estudo e depois envia a fatura; se o envio
   falha, o clique seguinte cria um SEGUNDO estudo para a mesma UC/competência.
   O docblock foi corrigido para dizer a verdade. Correção: guardar o id criado
   e reaproveitá-lo na retentativa, e/ou dedupe por (consumerUnit, competência)
   no `create` do estudo.

4. **Formulários e o reset do React 19**: `<form action={fn}>` reseta o
   formulário quando a ação termina — inclusive em erro. Na ficha da fatura são
   até 15 campos digitados que somem num 400. Afeta ~12 telas (fatura, ciclos,
   migrações, oportunidades, contratos, auditorias). Correção: campos
   controlados por estado nas telas de digitação longa (ficha da fatura
   primeiro), ou repovoar `defaultValue` de um estado capturado antes do submit.

5. **`usage.cost` da OpenRouter**: o opt-in `usage: { include: true }` foi
   adicionado ao gateway, mas a confirmação de que `usage.cost` passa a vir
   preenchido só é possível com uma chamada real — validar no primeiro uso e
   conferir o relatório `/llm/consumo`.

6. **Guarda de porta para Redis**: `environment.ts` valida só o hostname da
   `REDIS_URL`; `redis://localhost:6379` (túnel de produção nesta máquina)
   passa. O conjunto `PORTAS_DE_TUNEL` existe em
   `apps/api/scripts/run-local-prisma.mjs` — promovê-lo a módulo importável e
   recusar as seis portas de túnel também em runtime de dev/teste.

## Decisões de produto pendentes

7. **Reprocessar relatório de ciclo fechado**: o e2e
   (`energy-cycles.e2e.spec.ts`, "reprocessing a report for a closed cycle...")
   prova que é deliberado — mas o reprocesso zera a aprovação de um ciclo que só
   fechou porque estava aprovado. Decidir: é fluxo legítimo (então a tela podia
   pedir confirmação) ou deveria exigir reabrir o ciclo primeiro?

8. **Oportunidade em `revisitar` é terminal**: não existe transição
   `revisitar → aberta` na API (`assertOpportunityOpen` só aceita `aberta`), e a
   tela oferecia o botão lado a lado com ganhar/perder como se fosse reversível.
   O texto foi corrigido para ser honesto; decidir se a transição de retorno
   deve existir.

9. **Papéis de `GET /integrations` e `GET /jobs`**: fechados em
   `admin/diretoria/tech` e `admin/tech` respectivamente (alinhados à navegação
   da web). Se algum papel novo precisar dessas telas, o lugar de mudar é o
   controller + `organizacao.ts` juntos.

## Consolidações estruturais (ordem sugerida de ataque)

10. **Web — vocabulário e formatação**: 16 cópias de `formatDate`, 14 mapas de
    variante de status, `dinheiro` duplicado, e views de detalhe importando
    vocabulário das views de LISTA (`estudo-detalhe` ← `estudos-view`;
    `ciclo-detail`/`relatorios` ← `ciclos-view`). Criar `app/lib/formato.ts` e
    `app/lib/status.ts`, mover os rótulos para lá.
11. **Web — lista de campos da fatura duplicada** (`CAMPOS` em
    `nova-fatura-view` ≡ `CAMPOS_DA_FATURA` em `estudo-detalhe-view`): extrair
    para um módulo único com `min` por campo.
12. **Web — dois transportes de escrita em energia**: Server Actions
    (eficiência) vs proxy `/api/energy/*` (resto), com timeouts e formatos de
    erro diferentes. Escolher um.
13. **API — dono único de `job_runs`**: `jobs/` (inventário legado, leitura) e
    `jobs/queue/` (BullMQ, escrita) dividem a tabela com nomes que colidem
    (`JobsRepository` × `JobRunsRepository`). Renomear o legado
    (`job-inventory/`) ou mover a leitura para dentro de `jobs/queue`. Definir
    retenção de `job_runs` e reconciliação de linhas `running` órfãs.
14. **API — auditoria transacional única**: clientes/commercial/pluggamob
    repetem `$transaction { update + tx.eventLog.create }` montando o evento à
    mão (14+ vezes); whatsapp usa `AuditRepository`. Dar ao `AuditRepository` um
    `appendEvent(tx, ...)` e migrar os três repositórios.
15. **API — `EmailPort.configured()` por adaptador**: a regra "o que torna cada
    provedor utilizável" vive no factory do módulo E no `EmailStatusController`.
    Mover para o adaptador.
16. **Testes — `InMemoryEnergyRepository` triplicado** nos e2e de energia:
    consolidar em `test/support/in-memory-energy.ts`, como auth já fez.
17. **Contrato da chave LLM no shared**: `EstadoDaChave` é o único contrato HTTP
    declarado duas vezes à mão (api + web). Criar `packages/shared/src/llm.ts`
    com schema zod.
18. **Listagens sem teto** em commercial (`listOpportunities`/`listContracts`) e
    pluggamob (`sessions`/`reactivationQueue`): padronizar `take` + paginação
    (clientes já limita 100; `GET /jobs` agora limita 100).
19. **`pnpm-workspace.yaml`**: `allowBuilds` e `onlyBuiltDependencies` carregam
    a mesma allowlist em dois formatos. Confirmar qual chave o pnpm fixado honra
    e manter uma só (a que registra as recusas comentadas).
20. **Fronteira pluggamob**: `PrismaClientesRepository` lê `evUser` direto
    (`pluggamobLink`) em vez de passar pela porta `PluggamobRepository`.

## Débito de segurança conhecido (fora do repositório)

- Três credenciais (MinIO, Brevo, senha de usuário) permanecem no `.env` local
  por decisão explícita registrada em 2026-08-09. Nada delas está versionado —
  o gitleaks roda na CI. Rotacionar antes de somar gente ao projeto.

## Mantido de propósito (não é esquecimento)

- **Dois `ThrottlerModule.forRoot`** (auth e estudo): os e2e montam módulos
  diretamente; um módulo global quebraria essa montagem. O comentário em
  `estudo.module.ts` explica.
- **`BitrixListResponse.total`** sem leitor: documenta o formato real do wire da
  API Bitrix e é coberto pelos specs do client.
- **Exports de tipos sem importador externo** (`EmailTemplate`, `RenderedEmail`,
  `environmentSchema`, `EnergyResult`, `CommercialResult`): remover o `export`
  não apaga linha de código e arrisca erro de emissão de declaração; ficam.
