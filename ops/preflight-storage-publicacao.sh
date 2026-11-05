#!/usr/bin/env bash
# Somente leitura, antes do rsync: esta publicação não faz o cutover SeaweedFS → RustFS.
# O endpoint e o volume precisam já ser os mesmos que o Compose desta release usará.
set -euo pipefail

bloquear() {
  printf 'Publicação bloqueada: %s\n' "$1" >&2
  exit 1
}

container_atual() {
  local servico="$1" ids
  ids=$(docker ps --filter label=com.docker.compose.project=plugga-os \
    --filter "label=com.docker.compose.service=$servico" --format '{{.ID}}' 2>/dev/null) \
    || bloquear 'não foi possível consultar os containers atuais.'
  [[ -n "$ids" && "$ids" != *$'\n'* ]] \
    || bloquear "é necessário exatamente um container atual do serviço $servico no projeto plugga-os."
  printf '%s' "$ids"
}

conferir_container() {
  local id="$1" servico="$2" estado
  estado=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.State.Status}}' "$id" 2>/dev/null) \
    || bloquear 'não foi possível inspecionar os containers atuais.'
  [[ "$estado" == "plugga-os|$servico|running" ]] \
    || bloquear "o container atual de $servico não está ativo no projeto plugga-os."
}

api=$(container_atual api)
rustfs=$(container_atual rustfs)
conferir_container "$api" api
conferir_container "$rustfs" rustfs

saude=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$rustfs" 2>/dev/null) \
  || bloquear 'não foi possível consultar a saúde do RustFS.'
[[ "$saude" == healthy ]] || bloquear 'o RustFS atual não está saudável.'

volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}|{{.Name}}{{end}}{{end}}' "$rustfs" 2>/dev/null) \
  || bloquear 'não foi possível consultar o volume do RustFS.'
[[ "$volume" == 'volume|plugga-os_rustfs_data' ]] \
  || bloquear 'o RustFS atual não usa /data no volume plugga-os_rustfs_data previsto nesta publicação.'

pasta_script=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# Código do checkout por STDIN; nenhum segredo é passado pelo host ou pelo argv.
docker exec -i --workdir /app/apps/api "$api" node --input-type=module - --preflight-storage-publicacao \
  < "$pasta_script/preflight-storage-api.mjs" \
  || bloquear 'a API atual não confirmou a continuidade do armazenamento; nenhuma publicação foi iniciada.'
