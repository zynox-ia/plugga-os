"use client";

import type { Fornecedor, Obra } from "@plugga/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { criarPedido } from "../lib/compras-client";
import { ShellCard, StatusPill } from "./plugga-shell";

/**
 * Geração do pedido — POP §2.1.
 *
 * Envio único: itens, dados e orçamentos saem juntos. O POP exige a anexação
 * dos orçamentos **na geração**, e um formulário em dois passos deixaria existir
 * pedido sem a evidência que a análise vai examinar.
 */

type LinhaDeItem = { descricao: string; quantidade: string; unidade: string };
type LinhaDeCotacao = { fornecedorId: string; valor: string; valorFrete: string; prazoEntregaDias: string; condicoesPagamento: string; arquivo: File | null };

const itemVazio = (): LinhaDeItem => ({ descricao: "", quantidade: "", unidade: "" });
const cotacaoVazia = (): LinhaDeCotacao => ({
  fornecedorId: "",
  valor: "",
  valorFrete: "",
  prazoEntregaDias: "",
  condicoesPagamento: "",
  arquivo: null,
});

export function ComprasNovoPedidoView({
  empresa,
  obras,
  fornecedores,
  responsavelPadrao,
}: {
  empresa: string;
  obras: Obra[];
  fornecedores: Fornecedor[];
  responsavelPadrao: string;
}) {
  const router = useRouter();
  const [itens, setItens] = useState<LinhaDeItem[]>([itemVazio()]);
  const [cotacoes, setCotacoes] = useState<LinhaDeCotacao[]>([cotacaoVazia()]);
  const [destino, setDestino] = useState<"obra" | "cliente" | "interno">("obra");
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function atualizarItem(indice: number, campo: keyof LinhaDeItem, valor: string) {
    setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));
  }

  function atualizarCotacao(indice: number, campo: keyof LinhaDeCotacao, valor: string | File | null) {
    setCotacoes((atual) => atual.map((linha, i) => (i === indice ? { ...linha, [campo]: valor } : linha)));
  }

  async function enviar(formData: FormData) {
    setPendente(true);
    setErro(null);

    const arquivos = cotacoes.map((cotacao) => cotacao.arquivo).filter((a): a is File => a !== null);
    if (arquivos.length !== cotacoes.length) {
      setPendente(false);
      setErro("cada cotação precisa do arquivo do orçamento — o POP exige o anexo na geração do pedido");
      return;
    }

    const prazoLocal = String(formData.get("prazoEntregaDesejado") ?? "");
    const payload = {
      companyId: empresa,
      titulo: String(formData.get("titulo") ?? "").trim(),
      destino,
      obraId: destino === "obra" ? String(formData.get("obraId") ?? "") || undefined : undefined,
      clientId: destino === "cliente" ? String(formData.get("clientId") ?? "") || undefined : undefined,
      responsavelId: String(formData.get("responsavelId") ?? "").trim(),
      prazoEntregaDesejado: prazoLocal ? new Date(prazoLocal).toISOString() : undefined,
      valorOrcado: String(formData.get("valorOrcado") ?? "").trim(),
      itens: itens.map((item) => ({
        descricao: item.descricao.trim(),
        quantidade: item.quantidade.trim(),
        unidade: item.unidade.trim() || undefined,
      })),
      cotacoes: cotacoes.map((cotacao) => ({
        fornecedorId: cotacao.fornecedorId,
        valor: cotacao.valor.trim(),
        valorFrete: cotacao.valorFrete.trim() || undefined,
        prazoEntregaDias: cotacao.prazoEntregaDias ? Number(cotacao.prazoEntregaDias) : undefined,
        condicoesPagamento: cotacao.condicoesPagamento.trim() || undefined,
      })),
    };

    const resultado = await criarPedido(payload, arquivos);
    setPendente(false);
    if (!resultado.ok) {
      setErro(resultado.message);
      return;
    }
    router.push(`/compras?empresa=${empresa}`);
    router.refresh();
  }

  return (
    <ShellCard className="table-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">
            <Link href={`/compras?empresa=${empresa}`}>Compras</Link> · POP §2.1
          </span>
          <h2>Novo pedido de compra</h2>
        </div>
        {fornecedores.length === 0 ? <StatusPill variant="warning">Cadastre um fornecedor antes</StatusPill> : null}
      </div>

      <form action={enviar} className="auth-form" style={{ padding: "0 18px 18px", display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, 1fr)" }}>
          <label>
            Título do pedido
            <input name="titulo" required maxLength={200} placeholder="ex.: cabos e eletrodutos da subestação" />
          </label>
          <label>
            Valor orçado (planejado)
            <input name="valorOrcado" required inputMode="decimal" placeholder="5400.00" />
          </label>
          <label>
            Destino
            <select value={destino} onChange={(e) => setDestino(e.target.value as typeof destino)}>
              <option value="obra">Obra</option>
              <option value="cliente">Cliente</option>
              <option value="interno">Interno</option>
            </select>
          </label>
          {destino === "obra" ? (
            <label>
              Obra
              <select name="obraId" required>
                <option value="">Selecione…</option>
                {obras.map((obra) => (
                  <option key={obra.id} value={obra.id}>
                    {obra.nome}
                  </option>
                ))}
              </select>
            </label>
          ) : destino === "cliente" ? (
            <label>
              Cliente (id)
              <input name="clientId" required placeholder="uuid do cliente" />
            </label>
          ) : (
            <p className="card-note">Compra interna: sem obra nem cliente vinculado.</p>
          )}
          <label>
            Responsável de Compras
            <input name="responsavelId" required defaultValue={responsavelPadrao} placeholder="uuid do responsável" />
          </label>
          <label>
            Prazo de entrega desejado
            <input name="prazoEntregaDesejado" type="datetime-local" required />
          </label>
        </div>

        <fieldset style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12 }}>
          <legend>Itens</legend>
          {itens.map((item, indice) => (
            <div key={indice} style={{ display: "grid", gap: 8, gridTemplateColumns: "3fr 1fr 1fr auto", marginBottom: 8 }}>
              <input
                placeholder="Descrição do material"
                value={item.descricao}
                onChange={(e) => atualizarItem(indice, "descricao", e.target.value)}
                required
              />
              <input
                placeholder="Qtd."
                inputMode="decimal"
                value={item.quantidade}
                onChange={(e) => atualizarItem(indice, "quantidade", e.target.value)}
                required
              />
              <input
                placeholder="Un."
                value={item.unidade}
                onChange={(e) => atualizarItem(indice, "unidade", e.target.value)}
              />
              <button
                className="button button--small"
                type="button"
                onClick={() => setItens((atual) => atual.filter((_, i) => i !== indice))}
                disabled={itens.length === 1}
              >
                Remover
              </button>
            </div>
          ))}
          <button className="button button--small" type="button" onClick={() => setItens((atual) => [...atual, itemVazio()])}>
            + Item
          </button>
        </fieldset>

        <fieldset style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12 }}>
          <legend>Cotações · orçamentos anexados</legend>
          {cotacoes.map((cotacao, indice) => (
            <div key={indice} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 12 }}>
              <label>
                Fornecedor
                <select
                  value={cotacao.fornecedorId}
                  onChange={(e) => atualizarCotacao(indice, "fornecedorId", e.target.value)}
                  required
                >
                  <option value="">Selecione…</option>
                  {fornecedores.map((fornecedor) => (
                    <option key={fornecedor.id} value={fornecedor.id}>
                      {fornecedor.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Valor
                <input
                  inputMode="decimal"
                  value={cotacao.valor}
                  onChange={(e) => atualizarCotacao(indice, "valor", e.target.value)}
                  required
                />
              </label>
              <label>
                Frete
                <input
                  inputMode="decimal"
                  value={cotacao.valorFrete}
                  onChange={(e) => atualizarCotacao(indice, "valorFrete", e.target.value)}
                />
              </label>
              <label>
                Prazo de entrega (dias úteis)
                <input
                  inputMode="numeric"
                  value={cotacao.prazoEntregaDias}
                  onChange={(e) => atualizarCotacao(indice, "prazoEntregaDias", e.target.value)}
                />
              </label>
              <label>
                Condições
                <input
                  value={cotacao.condicoesPagamento}
                  onChange={(e) => atualizarCotacao(indice, "condicoesPagamento", e.target.value)}
                />
              </label>
              <label>
                Orçamento (PDF ou imagem)
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => atualizarCotacao(indice, "arquivo", e.target.files?.[0] ?? null)}
                  required
                />
              </label>
            </div>
          ))}
          <button
            className="button button--small"
            type="button"
            onClick={() => setCotacoes((atual) => [...atual, cotacaoVazia()])}
          >
            + Cotação
          </button>
        </fieldset>

        {erro ? (
          <p className="auth-error" role="alert">
            {erro}
          </p>
        ) : null}

        <div className="row-actions">
          <button className="button button--accent" type="submit" disabled={pendente}>
            {pendente ? "Enviando…" : "Gerar pedido"}
          </button>
          <Link className="button" href={`/compras?empresa=${empresa}`}>
            Cancelar
          </Link>
        </div>
      </form>
    </ShellCard>
  );
}
