"use client";

import { categoriasDeItemDeEstoque, rotulosDaCategoriaDeItemDeEstoque, type CompanyKey, type ItemDeEstoque } from "@plugga/shared";
import { Package, Plus, Ruler, Save, Tag } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { ROTULO_DA_EMPRESA } from "../../lib/compras";
import { numeroDigitado, paraContrato, UNIDADES_DE_ESTOQUE } from "../../lib/estoque";
import { opcoesDeEmpresa, Segmentado } from "../compras/campos-de-compra";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, Dialog, TextField } from "../ui";

const CATEGORIAS = categoriasDeItemDeEstoque.map((c) => ({ value: c, label: rotulosDaCategoriaDeItemDeEstoque[c], icon: <Tag /> }));

/**
 * Novo item de estoque (Empresa obrigatória) ou edição de um item. O saldo
 * inicial, com o custo, entra como a primeira movimentação; depois disso o
 * saldo só muda por movimentação.
 */
export function ItemForm({ item, aoCancelar, aoSalvar }: { item?: ItemDeEstoque; aoCancelar: () => void; aoSalvar: (item: ItemDeEstoque) => void }) {
  const editando = Boolean(item);
  const [empresa, setEmpresa] = useState<CompanyKey | null>(item?.empresa ?? null);
  const [nome, setNome] = useState(item?.nome ?? "");
  const [categoria, setCategoria] = useState<string>(item?.categoria ?? "");
  const [unidade, setUnidade] = useState(item?.unidade ?? "un");
  const [codigo, setCodigo] = useState(item?.codigo ?? "");
  const [minimo, setMinimo] = useState(item ? Number(item.estoqueMinimo).toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : "");
  const [saldo, setSaldo] = useState("");
  const [custo, setCusto] = useState("");
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focar = useRef(false);
  const unidades = Array.from(new Set([...UNIDADES_DE_ESTOQUE, unidade])).map((u) => ({ value: u, label: u, icon: <Ruler /> }));

  useEffect(() => {
    if (!erro || !focar.current) return;
    focar.current = false;
    const alvo = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    alvo?.focus(); alvo?.scrollIntoView({ block: "center" });
  }, [erro]);
  const e = (campo: string) => erro?.porCampo[campo];

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const porCampo: Record<string, string> = {};
    if (!empresa) porCampo.empresa = "escolha a empresa do item (Plugga ou Waze Energia).";
    if (!nome.trim()) porCampo.nome = "informe a descrição.";
    if (!categoria) porCampo.categoria = "escolha a categoria.";
    if (codigo.trim() && !/^[A-Za-z0-9./-]+$/.test(codigo.trim())) porCampo.codigo = "use letras, números, ponto, hífen ou barra.";
    const min = minimo.trim() ? numeroDigitado(minimo) : 0;
    if (min === null) porCampo.estoqueMinimo = "informe um número, como 20 ou 1.234,5.";
    const saldoN = saldo.trim() ? numeroDigitado(saldo) : null;
    const custoN = custo.trim() ? numeroDigitado(custo, 2) : null;
    if (!editando) {
      if (saldo.trim() && (saldoN === null || saldoN <= 0)) porCampo.saldoInicial = "informe uma quantidade maior que zero.";
      if (custo.trim() && (custoN === null || custoN <= 0)) porCampo.custoUnitario = "informe o custo, como 9,50.";
      if (saldoN && !custo.trim()) porCampo.custoUnitario = "informe o custo unitário do saldo inicial.";
      if (custoN && !saldo.trim()) porCampo.saldoInicial = "informe o saldo inicial.";
    }
    if (Object.keys(porCampo).length) { focar.current = true; setErro({ mensagem: "Confira os campos destacados.", porCampo }); return; }

    const base = { empresa, nome: nome.trim(), categoria, unidade, estoqueMinimo: paraContrato(min ?? 0, 3), ...(codigo.trim() ? { codigo: codigo.trim() } : {}) };
    setEnviando(true); setErro(null);
    const r = item
      ? await enviar<ItemDeEstoque>(`/api/suprimentos/estoque/itens/${item.id}`, "PATCH", { ...base, ...(item.podeTrocarEmpresa ? {} : { empresa: undefined }) })
      : await enviar<ItemDeEstoque>("/api/suprimentos/estoque/itens", "POST", { ...base, ...(saldoN ? { saldoInicial: paraContrato(saldoN, 3), custoUnitario: custoN!.toFixed(2) } : {}) });
    setEnviando(false);
    if (r.ok) { aoSalvar(r.dados); return; }
    focar.current = true; setErro(r.erro);
  }

  return <Dialog title={editando ? "Editar item de estoque" : "Novo item de estoque"} icon={<Package size={20} />} onClose={aoCancelar}
    description={editando ? "O saldo não se edita aqui: ele muda por entrada, saída ou ajuste." : "O item pertence a uma empresa. O saldo inicial entra como a primeira movimentação."}
    footer={<Button type="submit" form="form-item-estoque" icon={editando ? <Save size={16} /> : <Plus size={16} />} disabled={enviando}>{enviando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar item"}</Button>}>
    <form ref={formRef} id="form-item-estoque" className="ui-dialog-form" onSubmit={salvar} noValidate>
      {erro?.mensagem && !Object.values(erro.porCampo).some(Boolean) ? <Alert tone="danger" title={erro.mensagem} /> : null}
      {item && !item.podeTrocarEmpresa
        ? <TextField label="Empresa" value={ROTULO_DA_EMPRESA[item.empresa]} readOnly hint="O item já tem movimentação: a empresa não muda mais." />
        : <Segmentado rotulo="Empresa" obrigatorio valor={empresa} aoMudar={setEmpresa} opcoes={opcoesDeEmpresa} erro={e("empresa")} />}
      <TextField label="Descrição" required maxLength={200} placeholder="Ex.: Cabo solar 6 mm² preto" value={nome} onChange={(ev) => setNome(ev.target.value)} error={e("nome")} />
      <div className="ui-dialog-grid">
        <CampoDeMenu label="Categoria" required options={CATEGORIAS} value={categoria || undefined} onChange={setCategoria} placeholder="Selecione" icon={<Tag />} error={e("categoria")} />
        <CampoDeMenu label="Unidade" required options={unidades} value={unidade} onChange={setUnidade} icon={<Ruler />} error={e("unidade")} />
      </div>
      <div className="ui-dialog-grid">
        <TextField label="Código" maxLength={40} placeholder="Gerado se ficar vazio" value={codigo} onChange={(ev) => setCodigo(ev.target.value)} error={e("codigo")} />
        <TextField label="Estoque mínimo" inputMode="decimal" autoComplete="off" placeholder="0" suffix={unidade} value={minimo} onChange={(ev) => setMinimo(ev.target.value)} hint="Abaixo dele o item aparece como “Abaixo do mínimo”." error={e("estoqueMinimo")} />
      </div>
      {editando ? null : <div className="ui-dialog-grid">
        <TextField label="Saldo inicial" inputMode="decimal" autoComplete="off" placeholder="0" suffix={unidade} value={saldo} onChange={(ev) => setSaldo(ev.target.value)} error={e("saldoInicial")} />
        <TextField label="Custo unitário" inputMode="decimal" autoComplete="off" placeholder="0,00" prefix="R$" value={custo} onChange={(ev) => setCusto(ev.target.value)} hint={saldo.trim() ? "Obrigatório com saldo inicial." : undefined} error={e("custoUnitario")} />
      </div>}
    </form>
  </Dialog>;
}
