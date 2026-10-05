# Trava exclusiva de publicação (FR-005). Carregada por ops/deploy.sh.
#
# Duas publicações ao mesmo tempo (o deploy automático e um publicar.sh de
# emergência, ou dois deploys seguidos) disputariam o `docker compose`, a
# migração e a troca de imagens. A segunda recusa na hora, com mensagem, em vez
# de esperar ou de correr junto.
#
# PLUGGA_DEPLOY_LOCK  caminho do arquivo de trava (padrão /var/lock/plugga-deploy.lock;
#                     os testes usam um temporário)
# PLUGGA_DEPLOY_LOCK_HELD=1  quem chama já segura a trava (o publicar.sh a toma
#                     antes de trocar a pasta e depois chama o deploy.sh)

adquire_trava_de_deploy() {
  if [ "${PLUGGA_DEPLOY_LOCK_HELD:-0}" = "1" ]; then
    return 0
  fi
  local arquivo=${PLUGGA_DEPLOY_LOCK:-/var/lock/plugga-deploy.lock}
  if ! command -v flock >/dev/null 2>&1; then
    echo "✗ flock não está instalado; sem ele não há como garantir uma publicação por vez." >&2
    return 1
  fi
  # fd 9 fica aberto até o processo terminar: a trava morre junto com ele, mesmo em erro.
  exec 9>"$arquivo"
  if ! flock -n 9; then
    echo "✗ Já existe uma publicação em andamento (trava em $arquivo). Espere ela terminar e rode de novo." >&2
    return 1
  fi
  export PLUGGA_DEPLOY_LOCK_HELD=1
}
