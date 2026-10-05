# Modelo de dados: Fundação sólida

Todas as mudanças são **aditivas** e seguem o ciclo expandir → preencher → impor. Nomes em português onde o esquema atual já usa (`fornecedores`, `obras`); inglês onde ele usa (`clients`, `opportunities`). Tipos de data: `timestamptz` (UTC).

## 1. Empresa responsável (US4, FR-017, FR-018)

**O que existe.** `companies(id)` com `plugga` e `waze`. `company_id` já está em `fornecedores`, `obras` e `pedidos_de_compra`.

**O que muda.** Coluna `company_id TEXT` com FK para `companies(id)`:

| Tabela | Regra de preenchimento inicial | Observação |
|---|---|---|
| `opportunities` | `plugga` | Negócio da Plugga hoje |
| `contracts` | `plugga` | Segue a oportunidade de origem quando houver |
| `consumer_units` | `plugga` | Herda do cliente/contrato quando existir |
| `cycles`, `audits`, `contestations`, `market_migrations` | `plugga` | Energia |
| `energy_efficiency_studies` (e dependentes) | `plugga` | Eficiência energética |
| Pluggamob (`settlements`, `incidents`, `d14_credits`, `stations`, `locations`, etc.) | `plugga` | Eletromobilidade |
| `clients` | **sem `company_id`** | Cadastro único (ADR-0013); a empresa vive nos negócios |
| `pedidos_de_compra`, `obras`, `fornecedores` | já têm | `fornecedores` vira cadastro único na spec 003 |

Etapas:

1. `ADD COLUMN company_id TEXT NULL` + índice `(company_id, …)` usado nas consultas.
2. Backfill em lotes: valor `plugga`; registros que o dono marcar como duvidosos ficam em `company_assignment_review` (abaixo) e não recebem valor até decisão.
3. `ADD CONSTRAINT … FOREIGN KEY … NOT VALID`, depois `VALIDATE`.
4. `ADD CONSTRAINT … CHECK (company_id IS NOT NULL) NOT VALID`, `VALIDATE`, e só então `SET NOT NULL`.

Validação: quando um registro filho tem pai com empresa (contrato → oportunidade, estudo → unidade consumidora), as duas empresas **devem ser iguais** (restrição composta ou `CHECK` por gatilho, ver §3).

### `company_assignment_review` (fila de decisão manual)

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `table_name`, `record_id` | text, uuid | Registro a decidir |
| `suggested_company_id` | text | Sugestão (padrão `plugga`) |
| `reason` | text | Por que ficou duvidoso |
| `decided_company_id` | text, nulo | Decisão |
| `decided_by_id`, `decided_at` | uuid, timestamptz | Quem decidiu |

Transição: `pendente → decidido`; ao decidir, o registro recebe a empresa e um evento é gravado. Remoção da tabela após o término do backfill.

## 2. Escopo de acesso (US4, FR-019)

**Não há novas tabelas de acesso na spec 002.** O escopo é **derivado** do que existe:

- `user_platform_roles` → admin de plataforma alcança as duas empresas (regra de leitura).
- `user_company_memberships (user, company)` → a pessoa alcança aquela empresa.
- `user_company_roles (user, company, role)` → o papel vale **naquela** empresa.
- `user_department_access (user, company, department, is_manager)` → usado na navegação e na gestão de equipe; continua.

Entidade derivada (não persistida), em `packages/shared`:

```text
AccessScope {
  companies: CompanyKey[]                      // empresas que a pessoa alcança
  rolesByCompany: Record<CompanyKey, RoleKey[]> // papéis por empresa
  platformAdmin: boolean
}
```

Regras:
- Um papel só autoriza um recurso cuja `company_id` esteja em `rolesByCompany` com aquele papel: o guard exige o papel em **alguma** empresa do escopo (decisão sem carregar o registro) e o service/repositório confere a empresa do registro após carregá-lo (ver research D7).
- Listagens aplicam `company_id IN (companies)`.
- Conceder: o concedente só pode atribuir (empresa, papel) que ele administra; `admin` de plataforma só por admin; gestor de departamento não concede papel fora do próprio escopo (já validado, completa-se para empresa).
- `flattenRoles` permanece só para a navegação e deixa de alimentar o `RolesGuard`.

## 3. Restrições do banco (US9, FR-037 a FR-043)

| Regra | Mecanismo | Pré-condição |
|---|---|---|
| Cliente único por documento normalizado e por e-mail | Índice único em `clients(document_normalizado)` e `clients(lower(email))` (colunas geradas ou normalizadas na escrita) | Duplicatas resolvidas |
| UC única por cliente e código | Único `(client_id, code)` em `consumer_units` | Duplicatas resolvidas |
| Fornecedor único por empresa e documento | Já existe `(company_id, documento)`; unificação entre empresas fica para a spec 003 | n/a |
| Obra e fornecedor do pedido na mesma empresa do pedido | FK composta `(id, company_id)` ou gatilho de validação | Dados já coerentes (verificar antes) |
| Cotação selecionada pertence ao pedido | FK composta `(id, pedido_id)` | Verificar antes |
| Estados controlados | `CHECK` em `users.status` (`active`, `invited`, `deactivated`) e demais status em texto; `CHECK (competence_month BETWEEN 1 AND 12)` | Conferir valores existentes |
| Autoria e aprovação | FKs `ON DELETE RESTRICT` em `owner_id`, `created_by_id`, `approved_by_id`, `aprovou_id`, `selecionou_cotacao_id` etc. | Verificar órfãos |
| Imutabilidade | `agent_actions.requested_by` e `evidencias_de_obra.obra_id` passam a `RESTRICT`; gatilho `BEFORE TRUNCATE FOR EACH STATEMENT` nas tabelas imutáveis | Nenhum código apaga essas linhas |
| Índices de FK | Índices nas colunas listadas na auditoria (responsáveis, cliente, obra, ator do evento) | Tabelas pequenas |

Cada linha tem `rollback.sql` e teste de subir/descer.

## 4. Eventos de auditoria (FR-028, FR-034, FR-076)

`event_log` permanece append-only. O que muda é o **conteúdo** e o **registro**:

```text
event_log {
  id, occurred_at (timestamptz UTC),
  event_name   (catálogo; ver contracts/catalogo-eventos.md),
  entity_type, entity_id,
  actor_type ∈ {user, agent, system}, actor_id,
  company_id   (novo, nulo para eventos de plataforma),
  payload      jsonb  -- só identificadores e nomes de campos alterados; sem valores pessoais
}
```

- Coluna `company_id` (nula) e índice `(company_id, occurred_at)`; índice em `actor_id`.
- `payload` segue o formato `{ campos: ["nome", "telefone"], antes: null, depois: null }`: nomes dos campos, nunca valores de nome, e-mail, telefone, documento. Exceção: valores não pessoais necessários à auditoria (estado anterior e novo de um status).
- Eventos antigos com PII: **padrão: manter sem alterar**, com justificativa e prazo na política de retenção, porque a constituição (princípio IV) proíbe mutar o histórico. **Mascarar só é permitido depois de uma emenda explícita da constituição** (exceção estreita de LGPD, aprovada pelo dono, com ADR e registro da operação); sem a emenda, nenhuma migração suspende o gatilho de imutabilidade.

## 5. Retenção e apagamento (US8, FR-035, FR-036)

Política (a validar pelo dono):

| Categoria | Onde está | Finalidade | Prazo proposto | Mecanismo |
|---|---|---|---|---|
| Sessão (IP, agente de navegação) | `sessions` | Segurança | 30 dias após expirar | Job diário apaga |
| Cadastro de cliente (nome, documento, e-mail, telefone) | `clients` | Relação contratual | Vigência mais prazo legal | Anonimização por pedido de apagamento quando permitido |
| Fornecedor (documento) | `fornecedores` | Compras | Vigência mais prazo fiscal | Idem |
| Fatura e estudo (JSON com CNPJ/UC) | `energy_*`, balde S3 | Prestação do serviço | Vigência do contrato | Idem; arquivos no balde |
| Evento de auditoria | `event_log` | Prova de ação | Indefinido, **sem valores pessoais** daqui em diante | Legado mantido com justificativa; mascarar só após emenda da constituição |
| Backup | B2 | Recuperação | 35 dias (mensal 12 meses) | Expiração por regra do bucket |
| Log de aplicação | Docker | Operação | 14 dias | Rotação |

**Procedimento de apagamento** (documentado e ensaiado): localizar o titular (por documento ou e-mail) em `clients`, `fornecedores`, faturas, estudos, balde S3 e `event_log` (por identificador); anonimizar campos pessoais mantendo a linha e as chaves; registrar o atendimento (quem, quando, o que, sem o dado); conferir por consulta que nada identifica mais o titular; backups expiram naturalmente no prazo (comunicar o prazo ao titular).

## 6. Entidades de operação (sem tabelas novas)

| Entidade | Onde vive | Observação |
|---|---|---|
| Aprovação de publicação | GitHub (ambiente `production`) | Histórico no GitHub |
| Cópia de segurança | B2 + `manifesto.json` | Formato em contracts/backup-formato.md |
| Resultado da restauração | Registro do script + heartbeat | Última execução visível no monitor |
| Inventário de rotas | `contracts/inventario-rotas.json` (versionado) | Gerado e comparado por teste |
