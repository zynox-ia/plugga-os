# 06 · Ambiente local e testes

Você valida tudo no seu computador, com Docker, sem servidor de homologação. Como o Condutor trabalha uma issue por vez, bastam três ambientes.

## 1. Mapa de portas e bancos

| Ambiente | Endereço | Pasta | Banco |
|---|---|---|---|
| **Develop** | `http://develop.localhost:3000` | Pasta principal, branch `develop` | Banco local da develop |
| **Teste** (Condutor) | `http://teste.localhost:3001` | Worktree da issue | Banco de teste, cópia da develop |
| **Visual** (sessão visual) | `http://visual.localhost:3002` | Worktree da sessão | Banco da develop (sem migration) |

**Por que `*.localhost`:** o navegador não separa cookies por porta. Em `localhost:3000` e `localhost:3001` você seria deslogado ao trocar de aba. Com nomes diferentes, cada ambiente tem sua sessão. O Chrome e o Firefox resolvem qualquer `*.localhost` para o seu computador, sem configurar nada.

**Login:** o banco de teste é cópia da develop, então seus usuários de sempre valem nos três. Se a develop estiver vazia, o seed cria o **usuário fixo de teste**, registrado no `AGENTS.md`. Nunca há senha diferente por ambiente.

## 2. Dados para testar: a cópia do banco

Uma issue testada com banco vazio não prova nada. Quando a issue vai para você testar, o 09 Verificador:

1. Recria o banco de teste como **cópia do banco local da develop** (de preferência um banco a mais no mesmo servidor do Postgres, com o mesmo login).
2. Aplica as migrations da branch **na cópia**. O banco da develop nunca é tocado.
3. Develop vazia → roda o seed.
4. Cria os dados específicos da issue ("um cliente na etapa Contrato") e explica no "Como testar".
5. Sobe a aplicação na porta 3001 e confirma que responde.

**Regra fixa:** nunca copiar dados de produção para a máquina local (LGPD). A fonte da cópia é sempre o banco local da develop.

Os comandos do dia a dia ficam no `AGENTS.md`; os do banco de teste, na seção *Ambiente local* do `.specify/memory/projeto.md`. Os dois são descobertos e testados pela preparação da casa.

## 3. Como validar uma issue em Verifying

O Condutor deixa na issue e no chat:

```
✅ BRU-23 pronta para você testar
Abrir: http://teste.localhost:3001 · Login: admin@teste.local
Como testar:
1. Ir em Clientes → Novo cliente
2. Cadastrar "Maria" com telefone (92) 99999-0000
3. Conferir que Maria aparece na lista, filtrável pela etapa "Lead"
PR: <link>
```

- **Ajuste necessário:** fale com o Condutor. Ele chama um 06 com o ajuste, revisa de novo e devolve para Verifying.
- **Aprovado:** faça o merge do PR ("Squash and merge") e diga `mesclei`. O Condutor desmonta o teste, atualiza a develop e segue para a próxima.

## 4. Cuidados

| Situação | Cuidado |
|---|---|
| Issue com migration reprovada | Nada a desfazer: a migration rodou só na cópia |
| Docker parado | O Condutor pede para abrir o Docker Desktop antes de seguir |
| Modo automático durante a noite | O computador e o Traycer precisam ficar ligados; o Docker também |
