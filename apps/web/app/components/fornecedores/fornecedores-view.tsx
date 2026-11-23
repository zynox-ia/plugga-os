"use client";

import { categoriasDeFornecedor, rotulosDaCategoriaDeFornecedor, type DadosDePagamentoRevelados, type Fornecedor, type FornecedorNaLista } from "@plugga/shared";
import { Filter, LayoutGrid, List, Tag, Truck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { enviar } from "../../lib/clientes";
import { hrefDeFornecedores, nomeDoFornecedor, textoDaContagem, type FiltrosDeFornecedores } from "../../lib/fornecedores";
import { FiltroDeClientes } from "../clientes/filtro-de-clientes";
import estilosClientes from "../clientes/tela-clientes.module.css";
import estilosPipelines from "../pipelines/tela-pipelines.module.css";
import { Button, IconPlus, IconSearch } from "../ui";
import { FichaDoFornecedor, type DadosDaFicha } from "./ficha-do-fornecedor";
import { FornecedorForm } from "./fornecedor-form";
import styles from "./fornecedores.module.css";
import { CardsDeFornecedores, ListaDeFornecedores } from "./visualizacoes-fornecedores";

/**
 * Fornecedores (PLU-326): cadastro único da Plugga e da Waze, usado nas
 * cotações de Compras. Busca, situação e categoria vão para o endereço (a API
 * filtra); a ficha abre por cima, com endereço próprio. Não há exclusão:
 * fornecedor sai de uso por inativação.
 */
export function FornecedoresView({
  itens,
  contagem,
  filtros,
  ficha,
  fichaNaoEncontrada,
  podeAbrirCompras,
}: {
  itens: FornecedorNaLista[];
  contagem: { ativos: number; inativos: number };
  filtros: FiltrosDeFornecedores;
  /** A ficha rica (PLU-334): cadastro, desempenho e histórico, lidos juntos no servidor. */
  ficha: DadosDaFicha | null;
  fichaNaoEncontrada: boolean;
  /** Quem abre Compras vê o link do pedido no histórico; os outros, só o número. */
  podeAbrirCompras: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(filtros.busca ?? "");
  const [visao, setVisao] = useState<"cards" | "lista">("cards");
  const [pagina, setPagina] = useState(1);
  const [criando, setCriando] = useState(false);
  /** Ao editar, a chave PIX e os dados bancários completos, revelados pela API (auditado). */
  const [editando, setEditando] = useState<DadosDePagamentoRevelados | null>(null);
  const [lista, setLista] = useState(itens);
  const [erroSituacao, setErroSituacao] = useState<string | null>(null);
  const pendentesRef = useRef(new Set<string>());
  const [pendentes, setPendentes] = useState<ReadonlySet<string>>(new Set());
  const abasRef = useRef<HTMLDivElement>(null);

  useEffect(() => setBusca(filtros.busca ?? ""), [filtros.busca]);
  useEffect(() => setLista(itens), [itens]);

  const filtrado = Boolean(filtros.busca || filtros.situacao !== "todos" || filtros.categoria);
  const ir = (parcial: Partial<FiltrosDeFornecedores>, fornecedor: string | null = null) => {
    setPagina(1);
    router.push(hrefDeFornecedores({ ...filtros, ...parcial }, fornecedor), { scroll: false });
  };

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    ir({ busca: busca.trim() || undefined });
  }

  function limpar() {
    setBusca("");
    setPagina(1);
    router.push(hrefDeFornecedores({}), { scroll: false });
  }

  const abrir = (id: string) => router.push(hrefDeFornecedores(filtros, id), { scroll: false });
  const fecharFicha = () => router.push(hrefDeFornecedores(filtros), { scroll: false });

  async function mudarSituacao(fornecedor: FornecedorNaLista) {
    if (pendentesRef.current.has(fornecedor.id)) return;
    pendentesRef.current.add(fornecedor.id);
    setPendentes(new Set(pendentesRef.current));
    setErroSituacao(null);
    const resposta = await enviar<Fornecedor>(`/api/suprimentos/fornecedores/${fornecedor.id}/${fornecedor.ativo ? "inativar" : "reativar"}`, "POST", {});
    if (resposta.ok) {
      setLista((atuais) => atuais.map((item) => (item.id === fornecedor.id ? { ...item, ativo: resposta.dados.ativo, updatedAt: resposta.dados.updatedAt } : item)));
      router.refresh();
    } else {
      setErroSituacao(`Não foi possível ${fornecedor.ativo ? "inativar" : "reativar"} ${nomeDoFornecedor(fornecedor)}: ${resposta.erro.mensagem}`);
    }
    pendentesRef.current.delete(fornecedor.id);
    setPendentes(new Set(pendentesRef.current));
  }

  function navegarAbas(evento: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const proxima = evento.key === "Home" ? "cards" : evento.key === "End" ? "lista" : visao === "cards" ? "lista" : "cards";
    setVisao(proxima);
    abasRef.current?.querySelector<HTMLButtonElement>(`#fornecedores-visao-${proxima}`)?.focus();
  }

  const props = { itens: lista, aoAbrir: abrir, aoMudarSituacao: mudarSituacao, pendentes };

  return (
    <div className={estilosClientes.pagina}>
      <header className={estilosPipelines.cabecalho}>
        <div className={estilosPipelines.tituloGrupo}>
          <h1 className={estilosPipelines.titulo}>Fornecedores</h1>
          <h2 className={`${estilosPipelines.subtitulo} ${styles.subtitulo}`}>Cadastro único de fornecedores da Plugga e da Waze, usado nas cotações.</h2>
        </div>
        <div className={estilosPipelines.acoes}>
          <form className="equipe-busca" onSubmit={buscar} role="search" aria-label="Buscar fornecedores">
            <button type="submit" className={estilosClientes.botaoBusca} aria-label="Buscar fornecedores"><IconSearch className="equipe-busca-icon" /></button>
            <input className="equipe-busca-input" aria-label="Buscar fornecedor por nome ou CNPJ/CPF" type="search" maxLength={150} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fornecedor ou CNPJ…" />
          </form>
          <Button icon={<IconPlus />} onClick={() => setCriando(true)}>Novo fornecedor</Button>
        </div>
      </header>

      <div className={`${estilosPipelines.navegacao} ${estilosClientes.navegacao}`}>
        <div ref={abasRef} className={`${estilosPipelines.visoes} ${estilosClientes.abas}`} role="tablist" aria-label="Visualização de fornecedores" onKeyDown={navegarAbas}>
          <button type="button" id="fornecedores-visao-cards" className="ui-tab" role="tab" aria-selected={visao === "cards"} aria-controls="fornecedores-conteudo" tabIndex={visao === "cards" ? 0 : -1} onClick={() => setVisao("cards")}><LayoutGrid size={15} aria-hidden="true" />Cards</button>
          <button type="button" id="fornecedores-visao-lista" className="ui-tab" role="tab" aria-selected={visao === "lista"} aria-controls="fornecedores-conteudo" tabIndex={visao === "lista" ? 0 : -1} onClick={() => setVisao("lista")}><List size={15} aria-hidden="true" />Lista</button>
        </div>
        <p className={styles.contagem} role="status">{textoDaContagem(contagem.ativos + contagem.inativos, contagem.ativos)}</p>
        <div className={`${estilosPipelines.navegacaoDireita} ${estilosClientes.filtros}`} role="group" aria-label="Filtros de fornecedores">
          <div className={estilosClientes.filtroSituacao}>
            <FiltroDeClientes label="Situação" value={filtros.situacao} onChange={(valor) => ir({ situacao: valor as FiltrosDeFornecedores["situacao"] })}
              options={[{ value: "todos", label: "Todos", icon: <Filter /> }, { value: "ativos", label: "Ativos", icon: <UserRound /> }, { value: "inativos", label: "Inativos", icon: <UserRound /> }]} />
          </div>
          <div className={estilosClientes.filtroTipo}>
            <FiltroDeClientes label="Categoria" value={filtros.categoria ?? "todas"} onChange={(valor) => ir({ categoria: valor === "todas" ? undefined : (valor as FiltrosDeFornecedores["categoria"]) })}
              options={[{ value: "todas", label: "Todas as categorias", icon: <Tag /> }, ...categoriasDeFornecedor.map((c) => ({ value: c, label: rotulosDaCategoriaDeFornecedor[c], icon: <Tag /> }))]} />
          </div>
          {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar</Button> : null}
        </div>
      </div>

      {erroSituacao ? <p className="aviso aviso--erro" role="alert">{erroSituacao}</p> : null}
      {fichaNaoEncontrada ? <p className="aviso aviso--alerta" role="status">Fornecedor não encontrado. O link pode estar errado.</p> : null}

      <section id="fornecedores-conteudo" className={estilosClientes.conteudo} role="tabpanel" aria-labelledby={`fornecedores-visao-${visao}`}>
        {lista.length === 0 ? (
          <div className={estilosClientes.vazio} role="status">
            <Truck size={26} aria-hidden="true" />
            <h3>{filtrado ? "Nenhum fornecedor encontrado para a busca." : "Nenhum fornecedor cadastrado ainda."}</h3>
            <p>{filtrado ? "Experimente outro nome, CNPJ ou ajuste os filtros." : "Cadastre o primeiro fornecedor para usá-lo nas cotações de Compras."}</p>
            {filtrado ? <Button variant="secondary" size="sm" onClick={limpar}>Limpar filtros</Button> : <Button size="sm" icon={<IconPlus />} onClick={() => setCriando(true)}>Cadastrar fornecedor</Button>}
          </div>
        ) : visao === "cards" ? (
          <CardsDeFornecedores {...props} hrefDaFicha={(id) => hrefDeFornecedores(filtros, id)} />
        ) : (
          <ListaDeFornecedores {...props} pagina={pagina} aoMudarPagina={setPagina} ativos={lista.filter((f) => f.ativo).length} />
        )}
      </section>

      {criando ? (
        <FornecedorForm
          aoCancelar={() => setCriando(false)}
          aoSalvar={(fornecedor) => {
            setCriando(false);
            router.push(hrefDeFornecedores(filtros, fornecedor.id), { scroll: false });
            router.refresh();
          }}
        />
      ) : null}

      {ficha ? (
        <FichaDoFornecedor
          key={ficha.fornecedor.id}
          dados={ficha}
          podeAbrirCompras={podeAbrirCompras}
          aoFechar={() => { setEditando(null); fecharFicha(); }}
          aoEditar={setEditando}
          aoAtualizar={() => router.refresh()}
        />
      ) : null}
      {ficha && editando ? (
        <FornecedorForm
          key={`editar-${ficha.fornecedor.id}`}
          fornecedor={ficha.fornecedor}
          pagamento={editando}
          aoCancelar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); router.refresh(); }}
        />
      ) : null}
    </div>
  );
}
