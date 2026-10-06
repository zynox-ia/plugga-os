// API simulada para e2e/estados-de-erro.spec.ts (US12, T131).
//
// Derrubar a API de verdade não serve de teste: o middleware valida a sessão em
// GET /auth/me e, sem API, manda o usuário para o login antes de a página
// renderizar. Aqui /auth/me responde 200 e cada recurso falha de um jeito
// previsível, com o envelope de erro da T013 (contracts/erro-envelope.md).
//
// Uso (duas portas, sem banco):
//   node e2e/support/api-simulada.mjs                         # escuta em 3199
//   API_INTERNAL_URL=http://127.0.0.1:3199 PORT=3100 pnpm start:standalone
//   E2E_WEB_SIMULADO_URL=http://127.0.0.1:3100 pnpm test:e2e estados-de-erro
import { createServer } from "node:http";

const porta = Number(process.env.API_SIMULADA_PORT ?? 3199);

const usuario = {
  id: "00000000-0000-4000-8000-0000000000aa",
  email: "simulado@plugga.local",
  name: "Usuário simulado",
  status: "active",
  roles: [],
  access: { platformRoles: [], companies: [] },
};

const envelope = (codigo, mensagem) => ({ codigo, mensagem, requestId: "req-simulado-1" });

/** caminho -> [status, corpo] */
const respostas = new Map([
  ["/auth/me", [200, usuario]],
  // indisponível: a API responde 503 neste recurso
  ["/energy/cycles", [503, envelope("SERVICO_INDISPONIVEL", "Serviço indisponível.")]],
  // sem papel: a API nega acesso
  ["/commercial/contracts", [403, envelope("ACESSO_NEGADO", "Acesso negado.")]],
  // sessão inválida para este recurso
  ["/energy/audits", [401, envelope("NAO_AUTENTICADO", "Sessão inválida.")]],
]);

const servidor = createServer((req, res) => {
  const caminho = new URL(req.url ?? "/", "http://simulada").pathname;
  let alvo = respostas.get(caminho);
  if (!alvo && /^\/energy\/cycles\/[0-9a-f-]{36}$/.test(caminho)) {
    alvo = [404, envelope("NAO_ENCONTRADO", "Registro não encontrado.")];
  }
  const [status, corpo] = alvo ?? [404, envelope("NAO_ENCONTRADO", "Rota não simulada.")];
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(corpo));
});

servidor.listen(porta, "127.0.0.1", () => {
  console.log(`API simulada em http://127.0.0.1:${porta}`);
});
