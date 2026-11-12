import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ContaDeAssinatura, LoginDeAssinatura, ProvedorDeAssinatura, SituacaoDoLogin } from "@plugga/shared";

import { CliProxyFalhouError, CliProxyPort } from "./cliproxy.port";

const PRAZO_MS = 8_000;
const CAMINHO_DO_LOGIN: Record<ProvedorDeAssinatura, string> = { claude: "/anthropic-auth-url", codex: "/codex-auth-url" };
/** Prefixo dos ids de modelo de cada provedor, para filtrar o que o proxy lista. */
const PREFIXO_DO_MODELO: Record<ProvedorDeAssinatura, RegExp> = { claude: /^claude/i, codex: /^(gpt|o\d|codex)/i };

type Json = Record<string, unknown>;

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

/**
 * Cliente do CLIProxyAPI: gerenciamento (`/v0/management`, chave de gerenciamento) e modelos
 * (`/v1/models`, chave de cliente). As duas chaves vêm do ambiente da API e nenhuma
 * mensagem de erro daqui carrega chave, resposta do proxy ou conteúdo de conta.
 */
@Injectable()
export class CliProxyHttpAdapter extends CliProxyPort {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    super();
  }

  configurado(): boolean {
    return Boolean(this.config.get<string>("CLIPROXY_URL") && this.config.get<string>("CLIPROXY_MANAGEMENT_KEY"));
  }

  async saude(): Promise<boolean> {
    try {
      await this.chamar("GET", "/auth-files", { gerenciamento: true });
      return true;
    } catch (erro) {
      // Chave recusada é problema de configuração, não de proxy fora do ar: sobe para a tela.
      if (erro instanceof CliProxyFalhouError && erro.motivo === "chave_recusada") throw erro;
      return false;
    }
  }

  async iniciarLogin(provedor: ProvedorDeAssinatura): Promise<LoginDeAssinatura> {
    const corpo = await this.chamar("GET", CAMINHO_DO_LOGIN[provedor], { gerenciamento: true });
    const url = texto(corpo.url);
    const estado = texto(corpo.state);
    if (!url || !estado) throw new CliProxyFalhouError("resposta_inesperada");
    // O proxy devolve o endereço de autorização do provedor; nada além de http(s) segue para a tela.
    if (!/^https:\/\//i.test(url)) throw new CliProxyFalhouError("resposta_inesperada");
    return { url, estado };
  }

  async situacaoDoLogin(estado: string): Promise<SituacaoDoLogin> {
    const corpo = await this.chamar("GET", `/get-auth-status?state=${encodeURIComponent(estado)}`, { gerenciamento: true });
    switch (texto(corpo.status)) {
      case "wait":
        return "aguardando";
      case "ok":
        return "concluido";
      case "error":
        return "erro";
      default:
        throw new CliProxyFalhouError("resposta_inesperada");
    }
  }

  async listarContas(provedor: ProvedorDeAssinatura): Promise<ContaDeAssinatura[]> {
    const corpo = await this.chamar("GET", "/auth-files", { gerenciamento: true });
    const lista = Array.isArray(corpo.files) ? corpo.files : Array.isArray(corpo) ? corpo : null;
    if (!lista) throw new CliProxyFalhouError("resposta_inesperada");
    const contas: ContaDeAssinatura[] = [];
    for (const item of lista as unknown[]) {
      const objeto = typeof item === "object" && item !== null ? (item as Json) : null;
      const arquivo = typeof item === "string" ? texto(item) : texto(objeto?.name);
      if (!arquivo) continue;
      // O provedor vem do campo `provider`/`type` do arquivo; sem ele, do prefixo do nome.
      const origem = (texto(objeto?.provider) ?? texto(objeto?.type) ?? arquivo).toLowerCase();
      const pertence = provedor === "claude" ? /^(claude|anthropic)/.test(origem) : /^(codex|openai)/.test(origem);
      if (!pertence) continue;
      contas.push({ arquivo, email: texto(objeto?.email) });
    }
    return contas;
  }

  async removerConta(arquivo: string): Promise<void> {
    await this.chamar("DELETE", `/auth-files?name=${encodeURIComponent(arquivo)}`, { gerenciamento: true });
  }

  async listarModelos(provedor: ProvedorDeAssinatura): Promise<string[]> {
    const corpo = await this.chamar("GET", "/v1/models", { gerenciamento: false });
    const dados = Array.isArray(corpo.data) ? (corpo.data as Json[]) : null;
    if (!dados) throw new CliProxyFalhouError("resposta_inesperada");
    return dados.map((m) => texto(m.id)).filter((id): id is string => id !== null && PREFIXO_DO_MODELO[provedor].test(id));
  }

  private async chamar(metodo: "GET" | "DELETE", caminho: string, { gerenciamento }: { gerenciamento: boolean }): Promise<Json> {
    const base = this.config.get<string>("CLIPROXY_URL");
    const chave = gerenciamento ? this.config.get<string>("CLIPROXY_MANAGEMENT_KEY") : this.config.get<string>("CLIPROXY_API_KEY");
    if (!base || !chave) throw new CliProxyFalhouError("nao_configurado");

    const url = `${base.replace(/\/+$/, "")}${gerenciamento ? "/v0/management" : ""}${caminho}`;
    let resposta: Response;
    try {
      resposta = await fetch(url, { method: metodo, headers: { authorization: `Bearer ${chave}`, accept: "application/json" }, signal: AbortSignal.timeout(PRAZO_MS) });
    } catch {
      throw new CliProxyFalhouError("fora_do_ar");
    }
    if (resposta.status === 401 || resposta.status === 403) throw new CliProxyFalhouError("chave_recusada");
    if (!resposta.ok) throw new CliProxyFalhouError(resposta.status >= 500 ? "fora_do_ar" : "resposta_inesperada");
    if (metodo === "DELETE") return {};
    try {
      const corpo = (await resposta.json()) as unknown;
      if (corpo === null || typeof corpo !== "object") throw new Error("formato");
      return corpo as Json;
    } catch {
      throw new CliProxyFalhouError("resposta_inesperada");
    }
  }
}
