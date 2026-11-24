"use client";

import {
  categoriasDeFornecedor,
  documentoDeFornecedorValido,
  formasDePagamento,
  rotulosDaCategoriaDeFornecedor,
  rotulosDaFormaDePagamento,
  somenteDigitos,
  ufs,
  type CategoriaDeFornecedor,
  type DadosDePagamentoRevelados,
  type FormaDePagamento,
  type Fornecedor,
  type ListarFornecedoresResposta,
} from "@plugga/shared";
import { Building2, Check, FileText, MapPin, Phone, Power, Truck, Wallet } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { enviar, type ErroDoFormulario } from "../../lib/clientes";
import { cepFormatado, documentoFormatado, enderecoNoMapa, mascaraDocumento, mascaraTelefone, nomeDoFornecedor, telefoneFormatado, textoDeCotacoes } from "../../lib/fornecedores";
import { mascaraCep } from "../../lib/perfil-lead";
import { MapaDoEndereco } from "../pipelines/mapa-do-endereco";
import { Alert, Button, Dialog, Heading, SelectField, TextField, TextareaField } from "../ui";
import styles from "./fornecedores.module.css";

type Propriedades = {
  /** Ausente: cadastro novo. */
  fornecedor?: Fornecedor;
  /**
   * Na edição, a chave PIX e os dados bancários completos: a ficha só tem a
   * versão mascarada e pede o completo à API (auditado) antes de abrir.
   */
  pagamento?: DadosDePagamentoRevelados | null;
  aoSalvar: (fornecedor: Fornecedor) => void;
  aoCancelar: () => void;
};

/** Telefone gravado com o 55 do país e digitado sem ele é o mesmo número. */
const semDdi = (valor: unknown) => (typeof valor === "string" && /^55\d{10,11}$/.test(valor) ? valor.slice(2) : valor);

/** Só os campos cujo valor difere do que está gravado; formas de pagamento comparadas como conjunto. */
function camposAlterados(atual: Record<string, unknown>, corpo: Record<string, unknown>): Record<string, unknown> {
  const normalizar = (campo: string, valor: unknown) => (Array.isArray(valor) ? JSON.stringify([...valor].sort()) : JSON.stringify((campo === "telefone" ? semDdi(valor) : valor) ?? null));
  return Object.fromEntries(Object.entries(corpo).filter(([campo, valor]) => normalizar(campo, valor) !== normalizar(campo, atual[campo])));
}

/** Criar e editar fornecedor (PLU-326). Na edição, campo vazio vai como `null` e apaga. */
export function FornecedorForm({ fornecedor, pagamento, aoSalvar, aoCancelar }: Propriedades) {
  const editando = Boolean(fornecedor);
  const [nome, setNome] = useState(fornecedor?.nome ?? "");
  const [nomeFantasia, setNomeFantasia] = useState(fornecedor?.nomeFantasia ?? "");
  const [documento, setDocumento] = useState(documentoFormatado(fornecedor?.documento ?? null) ?? "");
  const [categoria, setCategoria] = useState<CategoriaDeFornecedor | "">(fornecedor?.categoria ?? "");
  const [contatoNome, setContatoNome] = useState(fornecedor?.contatoNome ?? "");
  const [telefone, setTelefone] = useState(telefoneFormatado(fornecedor?.telefone ?? null) ?? "");
  const [email, setEmail] = useState(fornecedor?.email ?? "");
  const [cep, setCep] = useState(cepFormatado(fornecedor?.cep ?? null) ?? "");
  const [logradouro, setLogradouro] = useState(fornecedor?.logradouro ?? "");
  const [numero, setNumero] = useState(fornecedor?.numero ?? "");
  const [complemento, setComplemento] = useState(fornecedor?.complemento ?? "");
  const [bairro, setBairro] = useState(fornecedor?.bairro ?? "");
  const [cidade, setCidade] = useState(fornecedor?.cidade ?? "");
  const [uf, setUf] = useState(fornecedor?.uf ?? "");
  const [formas, setFormas] = useState<FormaDePagamento[]>(fornecedor?.formasDePagamento ?? []);
  const [chavePix, setChavePix] = useState(pagamento?.chavePix ?? "");
  const [dadosBancarios, setDadosBancarios] = useState(pagamento?.dadosBancarios ?? "");
  const [observacoes, setObservacoes] = useState(fornecedor?.observacoes ?? "");
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Depois de um envio recusado, o foco vai ao primeiro campo com erro (ou ao aviso).
  const focarErro = useRef(false);
  useEffect(() => {
    if (!erro || !focarErro.current) return;
    focarErro.current = false;
    const alvo = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? formRef.current?.querySelector<HTMLElement>('[role="alert"]');
    if (alvo && !alvo.hasAttribute("tabindex") && alvo.getAttribute("role") === "alert") alvo.setAttribute("tabindex", "-1");
    alvo?.focus();
    alvo?.scrollIntoView({ block: "center" });
  }, [erro]);

  const erroDo = (campo: string) => erro?.porCampo[campo];

  function problemaDoDocumento(valor: string): string | undefined {
    const digitos = somenteDigitos(valor);
    if (!digitos) return undefined;
    if (digitos.length !== 11 && digitos.length !== 14) return "informe 11 dígitos (CPF) ou 14 (CNPJ).";
    return documentoDeFornecedorValido(digitos) ? undefined : `${digitos.length === 14 ? "CNPJ" : "CPF"} inválido. Confira os dígitos.`;
  }

  function conferirDocumento() {
    const problema = problemaDoDocumento(documento);
    setErro((atual) => {
      const porCampo = { ...(atual?.porCampo ?? {}) };
      if (problema) porCampo.documento = problema; else delete porCampo.documento;
      return atual || problema ? { mensagem: atual?.mensagem ?? "", porCampo } : null;
    });
  }

  /** 409 de documento repetido: a API não manda o nome do outro; a busca pelo documento acha (inclusive inativo). */
  async function nomeDoDuplicado(digitos: string): Promise<string | null> {
    const resposta = await enviar<ListarFornecedoresResposta>(`/api/suprimentos/fornecedores?${new URLSearchParams({ busca: digitos, situacao: "todos" })}`, "GET");
    if (!resposta.ok) return null;
    const outro = resposta.dados.itens.find((f) => f.documento === digitos && f.id !== fornecedor?.id);
    return outro ? `${nomeDoFornecedor(outro)}${outro.ativo ? "" : " (inativo)"}` : null;
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const porCampo: Record<string, string> = {};
    if (!nome.trim()) porCampo.nome = "informe a razão social ou o nome.";
    if (!categoria) porCampo.categoria = "escolha a categoria.";
    const problemaDoc = problemaDoDocumento(documento);
    if (problemaDoc) porCampo.documento = problemaDoc;
    if (cep.trim() && somenteDigitos(cep).length !== 8) porCampo.cep = "o CEP tem 8 dígitos, como 69000-000.";
    if (Object.keys(porCampo).length > 0) {
      focarErro.current = true;
      setErro({ mensagem: "Confira os campos destacados.", porCampo });
      return;
    }

    const texto = (valor: string) => valor.trim() || null;
    const corpo = {
      nome: nome.trim(),
      nomeFantasia: texto(nomeFantasia),
      documento: somenteDigitos(documento) || null,
      categoria,
      contatoNome: texto(contatoNome),
      telefone: somenteDigitos(telefone) || null,
      email: texto(email),
      cep: somenteDigitos(cep) || null,
      logradouro: texto(logradouro),
      numero: texto(numero),
      complemento: texto(complemento),
      bairro: texto(bairro),
      cidade: texto(cidade),
      uf: uf || null,
      formasDePagamento: formas,
      chavePix: texto(chavePix),
      dadosBancarios: texto(dadosBancarios),
      observacoes: texto(observacoes),
    };

    // Na edição vai só o que mudou: a API registra no evento os campos enviados.
    // Sem o completo revelado, os campos de pagamento não são comparáveis: ficam de fora para não apagar nada.
    const atual = fornecedor ? { ...fornecedor, chavePix: pagamento?.chavePix ?? null, dadosBancarios: pagamento?.dadosBancarios ?? null } : null;
    const comparavel = fornecedor && !pagamento ? Object.fromEntries(Object.entries(corpo).filter(([c]) => c !== "chavePix" && c !== "dadosBancarios")) : corpo;
    const alteracoes = atual ? camposAlterados(atual, comparavel) : corpo;
    if (fornecedor && Object.keys(alteracoes).length === 0) {
      aoCancelar();
      return;
    }

    setEnviando(true);
    setErro(null);
    const resposta = fornecedor
      ? await enviar<Fornecedor>(`/api/suprimentos/fornecedores/${fornecedor.id}`, "PATCH", alteracoes)
      : await enviar<Fornecedor>("/api/suprimentos/fornecedores", "POST", corpo);
    if (resposta.ok) {
      setEnviando(false);
      aoSalvar(resposta.dados);
      return;
    }
    if (resposta.erro.codigo === "CONFLITO_UNICIDADE" && corpo.documento) {
      const outro = await nomeDoDuplicado(corpo.documento);
      resposta.erro.porCampo.documento = outro ? `já cadastrado como ${outro}.` : "já existe um fornecedor com este documento.";
      resposta.erro.mensagem = "Confira os campos destacados.";
    }
    setEnviando(false);
    focarErro.current = true;
    setErro(resposta.erro);
  }

  async function alternarSituacao() {
    if (!fornecedor) return;
    setEnviando(true);
    setErro(null);
    const resposta = await enviar<Fornecedor>(`/api/suprimentos/fornecedores/${fornecedor.id}/${fornecedor.ativo ? "inativar" : "reativar"}`, "POST", {});
    setEnviando(false);
    if (resposta.ok) aoSalvar(resposta.dados);
    else setErro(resposta.erro);
  }

  const titulo = fornecedor ? nomeDoFornecedor(fornecedor) : "Novo fornecedor";
  const descricao = fornecedor
    ? `${documentoFormatado(fornecedor.documento) ?? "Sem documento"} · ${textoDeCotacoes(fornecedor.cotacoes)}`
    : "Cadastre uma vez e use nas cotações de Compras.";

  return (
    <Dialog
      title={titulo}
      description={descricao}
      icon={<Truck size={20} />}
      onClose={aoCancelar}
      accessibleLabel={fornecedor ? `Fornecedor ${titulo}` : "Novo fornecedor"}
      footer={<>
        {fornecedor ? (
          <Button variant="secondary" icon={<Power size={16} />} disabled={enviando} onClick={alternarSituacao}>
            {fornecedor.ativo ? "Inativar" : "Reativar"}
          </Button>
        ) : null}
        <Button type="submit" form="form-fornecedor" icon={<Check size={16} />} disabled={enviando}>
          {enviando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar fornecedor"}
        </Button>
      </>}
    >
      <form ref={formRef} id="form-fornecedor" className="ui-dialog-form" onSubmit={salvar} noValidate>
        {erro?.mensagem ? <Alert tone="danger" title={erro.mensagem} /> : null}
        {fornecedor && !fornecedor.ativo ? (
          <div className={`ui-dialog-notice ${styles.avisoInativo}`}>
            <span className={styles.aviso}><Power size={14} aria-hidden="true" />Fornecedor inativo: não aparece nas novas cotações. As cotações antigas continuam com ele.</span>
          </div>
        ) : null}

        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header"><Heading as="h3" icon={<Building2 />}>Identificação</Heading></div>
          <TextField label="Razão social ou nome" required maxLength={200} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Solartec Distribuidora Ltda." error={erroDo("nome")} />
          <div className="ui-dialog-grid">
            <TextField label="Nome fantasia" maxLength={200} value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} error={erroDo("nomeFantasia")} />
            <TextField label="CNPJ ou CPF" inputMode="numeric" value={documento} onChange={(e) => setDocumento(mascaraDocumento(e.target.value))} onBlur={conferirDocumento}
              placeholder="00.000.000/0000-00" hint="Opcional. Não pode repetir no cadastro." error={erroDo("documento")} />
          </div>
          <SelectField label="Categoria" required value={categoria} onChange={(valor) => setCategoria(valor as CategoriaDeFornecedor)} placeholder="Selecione"
            options={categoriasDeFornecedor.map((c) => ({ value: c, label: rotulosDaCategoriaDeFornecedor[c] }))} error={erroDo("categoria")} />
        </section>

        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header"><Heading as="h3" icon={<Phone />}>Contato</Heading></div>
          <div className="ui-dialog-grid">
            <TextField label="Nome do contato" maxLength={150} value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} error={erroDo("contatoNome")} />
            <TextField label="Telefone / WhatsApp" inputMode="tel" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} placeholder="(92) 99999-9999" error={erroDo("telefone")} />
          </div>
          <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vendas@fornecedor.com.br" error={erroDo("email")} />
        </section>

        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<MapPin />}>Endereço</Heading>
            <p className="ui-dialog-section-desc">Aparece no mapa da ficha. Todos os campos são opcionais.</p>
          </div>
          <div className="ui-dialog-grid">
            <TextField label="CEP" inputMode="numeric" value={cep} onChange={(e) => setCep(mascaraCep(e.target.value))} placeholder="69000-000" error={erroDo("cep")} />
            <TextField label="Bairro" maxLength={100} value={bairro} onChange={(e) => setBairro(e.target.value)} error={erroDo("bairro")} />
          </div>
          <div className={`ui-dialog-grid ${styles.ruaNumero}`}>
            <TextField label="Logradouro" maxLength={200} value={logradouro} onChange={(e) => setLogradouro(e.target.value)} placeholder="Rua, avenida…" error={erroDo("logradouro")} />
            <TextField label="Número" maxLength={20} value={numero} onChange={(e) => setNumero(e.target.value)} error={erroDo("numero")} />
          </div>
          <TextField label="Complemento" maxLength={100} value={complemento} onChange={(e) => setComplemento(e.target.value)} placeholder="Sala, galpão, referência" error={erroDo("complemento")} />
          <div className={`ui-dialog-grid ${styles.cidadeUf}`}>
            <TextField label="Cidade" maxLength={100} value={cidade} onChange={(e) => setCidade(e.target.value)} error={erroDo("cidade")} />
            <SelectField label="UF" value={uf} onChange={setUf} placeholder="UF" options={ufs.map((u) => ({ value: u, label: u }))} error={erroDo("uf")} />
          </div>
          <MapaDoEndereco endereco={enderecoNoMapa({ cep: somenteDigitos(cep), logradouro, numero, bairro, cidade, uf })} rotulo="fornecedor" />
        </section>

        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header">
            <Heading as="h3" icon={<Wallet />}>Pagamento</Heading>
            <p className="ui-dialog-section-desc">Formas aceitas e dados para pagar o fornecedor.</p>
          </div>
          <fieldset className={styles.formas}>
            <legend>Formas de pagamento aceitas</legend>
            <div className="ui-dialog-tags">
              {formasDePagamento.map((forma) => {
                const marcada = formas.includes(forma);
                return <label key={forma} className={`ui-dialog-tag ${styles.forma}${marcada ? " ui-dialog-tag--active" : ""}`}>
                  <input type="checkbox" className="sr-only" checked={marcada}
                    onChange={(e) => setFormas((atuais) => e.target.checked ? [...atuais, forma] : atuais.filter((f) => f !== forma))} />
                  <Check size={12} aria-hidden="true" />{rotulosDaFormaDePagamento[forma]}
                </label>;
              })}
            </div>
          </fieldset>
          <div className="ui-dialog-grid">
            <TextField label="Chave PIX" maxLength={140} value={chavePix} onChange={(e) => setChavePix(e.target.value)} placeholder="CNPJ, e-mail, telefone ou aleatória" error={erroDo("chavePix")} />
            <TextField label="Dados bancários" maxLength={500} value={dadosBancarios} onChange={(e) => setDadosBancarios(e.target.value)} placeholder="Banco · agência · conta" error={erroDo("dadosBancarios")} />
          </div>
        </section>

        <section className="ui-dialog-section">
          <div className="ui-dialog-section-header"><Heading as="h3" icon={<FileText />}>Observações</Heading></div>
          <TextareaField aria-label="Observações" maxLength={2000} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Prazos, pedido mínimo, regras de entrega…" error={erroDo("observacoes")} />
        </section>
      </form>
    </Dialog>
  );
}
