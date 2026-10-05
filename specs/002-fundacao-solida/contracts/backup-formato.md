# Contrato: formato do backup externo

Valida FR-011, FR-012, FR-015 e FR-016.

## Destino

Bucket B2 privado, **Object Lock ativado** (modo governança, 35 dias), versionamento ligado, regra de expiração por prefixo.

```text
b2://<bucket>/
├── diario/AAAA/MM/plugga-os-AAAAMMDDTHHMMSSZ.tar.age
├── diario/AAAA/MM/plugga-os-AAAAMMDDTHHMMSSZ.manifesto.json
├── mensal/AAAA/plugga-os-AAAAMM01T....tar.age         # retenção 12 meses
└── mensal/AAAA/plugga-os-AAAAMM01T....manifesto.json
```

## Conteúdo do arquivo (`.tar` antes de criptografar)

```text
banco/plugga_os.dump                 # pg_dump -Fc
arquivos/<balde>/<chave...>          # espelho dos baldes de negócio
LEIAME.txt                           # versão do formato, data, comando de restauração
```

Baldes de negócio incluídos (lista em `ops/backup/baldes.txt`, versionada): os baldes `{empresa}-{departamento}` de negócio e `plugga-corpus-faturas`. O balde `plugga-backups` (backup local) **não** entra, para não recursar.

## Manifesto (texto claro, **sem dado pessoal**)

```json
{
  "formato": 1,
  "criadoEm": "2026-10-05T03:10:07Z",
  "versaoGit": "<sha>",
  "arquivo": { "nome": "plugga-os-20261005T031007Z.tar.age", "bytes": 1234567, "sha256": "<hex>" },
  "banco": { "tabelas": 59, "linhasPorTabela": { "users": 3, "companies": 2 } },
  "arquivos": { "baldes": { "plugga-energia-opm": { "objetos": 12, "bytes": 3456789 } } },
  "destinatarios": ["age1<dono>...", "age1<teste>..."]
}
```

Regra: contagens e tamanhos, nunca nomes de clientes, chaves de objeto com nome de cliente, nem conteúdo.

## Criptografia

- `age` com **dois destinatários**: chave pública do dono (privada offline) e chave pública de teste (privada em `/root/.plugga-restauracao.key`, modo 600, só na VPS).
- A VPS nunca tem a chave privada do dono.
- Chave de aplicação do B2 da VPS: **só escrita** (sem apagar, sem listar além do necessário). Chave de leitura (restauração) em arquivo separado, modo 600.
- Nenhuma chave aparece em linha de comando (`docker inspect`, `ps`): variáveis por arquivo de ambiente ou `--env-file`, não `-e CHAVE=...` (FR-015).

## Rotinas

| Rotina | Frequência | Falha se… |
|---|---|---|
| `backup-externo.sh` | Diária, 03:10 UTC (já existe o horário do backup local) | Banco ou baldes de origem vazios; arquivo enviado com tamanho ou SHA-256 diferente do manifesto; envio falhou |
| `restaurar-teste.sh` | Semanal | SHA-256 diferente; descriptografia falhou; contagem de tabelas, linhas ou objetos diferente do manifesto; restauração falhou |
| Heartbeat | Cada rotina | Sem ping em 26 h (diária) ou 8 dias (semanal) |

## Recuperação de desastre (resumo; versão completa no GUIA)

1. Nova VPS com Docker e o repositório (`git clone`).
2. Recuperar a chave privada `age` do dono.
3. Baixar o último `.tar.age` e o manifesto do B2 (chave de leitura).
4. Conferir SHA-256, descriptografar, `pg_restore` no Postgres novo, copiar `arquivos/` para os baldes.
5. Subir o sistema, conferir `/health/ready` e contagens do manifesto.
6. Medir e registrar o tempo (meta: ≤ 4 h; perda máxima: 24 h).
