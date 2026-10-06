import Link from "next/link";

import type { ErroDeApi, TipoDeErroApi } from "../lib/api-core";
import { ShellCard } from "./plugga-shell";

const TEXTOS: Record<TipoDeErroApi, { titulo: string; corpo: string }> = {
  naoAutenticado: {
    titulo: "Sessão expirada",
    corpo: "Sua sessão expirou ou você não entrou. Faça login para continuar.",
  },
  proibido: {
    titulo: "Acesso negado",
    corpo: "Você não tem permissão para ver este conteúdo. Se acha que deveria ter, fale com quem administra a equipe.",
  },
  naoEncontrado: {
    titulo: "Registro não encontrado",
    corpo: "Não encontramos este registro. Ele pode ter sido removido ou o endereço está incorreto.",
  },
  indisponivel: {
    titulo: "Serviço indisponível",
    corpo: "Não conseguimos falar com o serviço agora. Os dados não foram carregados; tente novamente em instantes.",
  },
  rejeitado: {
    titulo: "Não foi possível carregar",
    corpo: "A API recusou a consulta.",
  },
};

/**
 * Tela distinta para cada tipo de erro da API (US12, T126, SC-017). Uma falha
 * real nunca pode parecer lista vazia nem dado de exemplo.
 */
export function EstadoDaApi({
  erro,
  eyebrow,
  voltar,
}: {
  erro: ErroDeApi;
  eyebrow?: string;
  voltar?: { href: string; rotulo: string };
}) {
  const texto = TEXTOS[erro.tipo];
  return (
    <ShellCard className="panel-card">
      <div role="alert" data-testid={`estado-api-${erro.tipo}`}>
        <div className="card-heading">
          <div>
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            <h2>{texto.titulo}</h2>
          </div>
        </div>
        <p className="card-note">{erro.tipo === "rejeitado" ? erro.mensagem : texto.corpo}</p>
        {erro.requestId ? <p className="card-note">Código para suporte: {erro.requestId}</p> : null}
        <p className="card-note">
          {erro.tipo === "naoAutenticado" ? <Link href="/login">Entrar</Link> : null}
          {voltar ? <Link href={voltar.href}>{voltar.rotulo}</Link> : null}
        </p>
      </div>
    </ShellCard>
  );
}
