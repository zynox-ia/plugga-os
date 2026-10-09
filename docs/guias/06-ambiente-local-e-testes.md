# 06 · Ambiente local e testes

Você valida tudo no seu computador, com Docker, sem servidor de homologação. Para isso funcionar com até três issues ao mesmo tempo, cada uma tem sua porta e seu banco.

## 1. Mapa de portas e bancos

| Ambiente | Pasta | Branch | Aplicação | Banco |
|---|---|---|---|---|
| **Develop** | Pasta principal | `develop` | `localhost:3000` | Banco local padrão do `docker compose` |
| **Diretor 01** | Worktree da issue | branch da issue | `localhost:3001` | Cópia isolada `<repo>-d01` |
| **Diretor 02** | Worktree da issue | branch da issue | `localhost:3002` | Cópia isolada `<repo>-d02` |
| **Diretor 03** | Worktree da issue | branch da issue | `localhost:3003` | Cópia isolada `<repo>-d03` |

A porta da develop vem do `projeto.md` (padrão 3000). **Nenhum Diretor derruba a develop** nem usa a porta ou o banco de outro Diretor.

## 2. Dados para testar: a cópia do banco

Uma issue testada com banco vazio não prova nada. Por isso, quando uma issue chega a Verifying, o Diretor:

1. Sobe o banco isolado dele (`docker compose -p <repo>-d0N up -d`).
2. **Copia os dados do banco local da develop** para esse banco (dump e restore).
3. Aplica as migrations da branch **na cópia**. O banco da develop nunca é tocado.
4. Se a develop estiver vazia, roda o **seed** do projeto (dados de exemplo).
5. Se a issue precisa de um dado específico ("um cliente na etapa Contrato"), cria esse dado na cópia e explica no "Como testar".
6. Sobe a aplicação na porta dele e confirma que responde.

Resultado: `localhost:3002` abre com os mesmos dados que você já usa na develop, mais a mudança da issue.

**Regra fixa:** nunca copiar dados de produção para a máquina local (LGPD). A fonte da cópia é sempre o banco local da develop.

Os comandos do dia a dia (instalar, subir serviços, migrations, seed, subir a aplicação, testes) ficam no `AGENTS.md` da raiz; os de banco isolado e cópia ficam na seção *Ambiente local* do `.specify/memory/projeto.md`. Os dois são descobertos e testados pela preparação da casa.

## 3. Como validar uma issue em Verifying

O Diretor deixa na issue e no chat um bloco assim:

```
✅ Pronta para validação · Diretor 02
Abrir: http://localhost:3002
Como testar:
1. Entrar com o usuário de teste (admin@teste.local)
2. Ir em Clientes → Novo cliente
3. Cadastrar "Maria" com telefone (92) 99999-0000
4. Conferir que Maria aparece na lista, filtrável pela etapa "Lead"
Dados de teste: cliente "João (Contrato)" criado para o critério 3
PR: <link>
```

Você testa seguindo os passos e os critérios de aceite. Então:
- **Ajuste necessário:** fale com o Diretor no chat. Ele corrige, revisa de novo e devolve para Verifying.
- **Aprovado:** faça o merge do PR e diga ao Coordenador `aprovei <ID>`. O Diretor desmonta o ambiente de teste e remove a worktree; o Coordenador arquiva o Diretor e recarrega a develop em `localhost:3000` já com a mudança.

## 4. Cuidados

| Situação | Cuidado |
|---|---|
| Duas issues mexem no mesmo domínio | O Coordenador evita rodar as duas juntas |
| Testes automatizados usam o banco local | Só um agente roda a suíte por vez (trava de verificação) |
| Compose fixa a porta do banco no host (ex.: `5432:5432`) | A preparação registra como cada cópia usa outra porta; sem isso, os bancos dos Diretores entram em conflito |
| Issue com migration reprovada | Nada a desfazer: a migration rodou só na cópia do Diretor |
| Docker parado | O Coordenador pede para abrir o Docker Desktop antes de seguir |
