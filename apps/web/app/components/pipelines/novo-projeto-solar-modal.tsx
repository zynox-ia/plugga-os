"use client";

import {
  BrickWall, Building2, CircleHelp, FileText, Grid2x2, Home, LandPlot, PanelTop, Pencil,
  Plus, Save, Square, Sun, Tractor, Upload, Waves, X, Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { listLeadDocumentsResponseSchema, type LeadSolarInstallationType, type LeadSolarProject, type LeadSolarRoofType } from "@plugga/shared";
import { enviar } from "../../lib/clientes";
import { enviarDocumentoDoLead, FORMATOS_DOCUMENTO, tamanhoDocumento, validarArquivoDocumento } from "../../lib/documentos-lead";
import {
  projetoParaRascunho,
  ROTULO_INSTALACAO_SOLAR,
  ROTULO_TELHADO_SOLAR,
  rascunhoProjetoSolarVazio,
  validarRascunhoProjetoSolar,
  type RascunhoProjetoSolar,
} from "../../lib/projetos-solares-lead";
import { Alert, Button, Dialog, Heading, SelectField, TextField } from "../ui";
import styles from "./projetos-do-lead.module.css";

type ContaLocal = { id: string; nome: string; tamanho: string; documentoId?: string; estado: "enviando" | "pronto" | "erro"; erro?: string };

const ICONE_INSTALACAO: Record<LeadSolarInstallationType, ReactElement> = {
  residential: <Home />,
  commercial: <Building2 />,
  rural: <Tractor />,
};

const ICONE_TELHADO: Record<LeadSolarRoofType, ReactElement> = {
  metalico: <PanelTop />,
  ceramico: <BrickWall />,
  fibra: <Waves />,
  cimento: <Square />,
  laje: <Grid2x2 />,
  solo: <LandPlot />,
  outro: <CircleHelp />,
};

function contasDoProjeto(projeto?: LeadSolarProject): ContaLocal[] {
  return (projeto?.energyBillDocumentIds ?? []).map((documentoId, indice) => ({
    id: documentoId,
    documentoId,
    nome: `Conta de energia ${indice + 1}`,
    tamanho: "Anexada",
    estado: "pronto" as const,
  }));
}

export function NovoProjetoSolarModal({
  negocioId,
  projeto,
  salvando,
  erro,
  aoSalvar,
  aoAlterarRascunho,
  aoFechar,
  naQualificacao = false,
}: {
  negocioId: string;
  projeto?: LeadSolarProject;
  /** Lead na Qualificação: salvar exige a conta de energia e avança para Cotações/Proposta. */
  naQualificacao?: boolean;
  salvando: boolean;
  erro: string | null;
  aoSalvar: (rascunho: RascunhoProjetoSolar) => Promise<boolean>;
  aoAlterarRascunho: (alterado: boolean) => void;
  aoFechar: () => void;
}) {
  const editando = !!projeto;
  const [inicial] = useState(() => (projeto ? projetoParaRascunho(projeto) : rascunhoProjetoSolarVazio()));
  const [dados, setDados] = useState(inicial);
  const [contas, setContas] = useState<ContaLocal[]>(() => contasDoProjeto(projeto));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [arrastando, setArrastando] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const arrastos = useRef(0);
  const ocupado = salvando || contas.some((conta) => conta.estado === "enviando");
  const [contasIndisponiveis, setContasIndisponiveis] = useState<Set<string>>(new Set());
  const [erroDisponibilidade, setErroDisponibilidade] = useState(false);
  const [tentativaDisponibilidade, setTentativaDisponibilidade] = useState(0);

  // Referência já persistida (hidratada de contasDoProjeto) pode ter sido reclassificada ou
  // arquivada depois: o servidor preserva, mas a ficha avisa (PLU-313) sem travar o salvamento.
  // Falha aqui (rede, HTTP, resposta inválida) nunca vira "disponível" em silêncio: o aviso de
  // "não foi possível verificar" é explícito, porque o servidor agora aceita salvar uma conta já
  // persistida mesmo indisponível — sem o aviso, o usuário salvaria sem saber do risco.
  useEffect(() => {
    if (!editando) return;
    const controller = new AbortController();
    setErroDisponibilidade(false);
    void enviar<unknown>(`/api/leads/${negocioId}/documentos`, "GET", undefined, controller.signal).then((resposta) => {
      if (controller.signal.aborted) return;
      if (!resposta.ok) { setErroDisponibilidade(true); return; }
      const lista = listLeadDocumentsResponseSchema.safeParse(resposta.dados);
      if (!lista.success) { setErroDisponibilidade(true); return; }
      const disponiveis = new Set(lista.data.documents.filter((doc) => doc.category === "conta_de_energia" && !doc.archivedAt).map((doc) => doc.id));
      setContasIndisponiveis(new Set(contasDoProjeto(projeto).map((conta) => conta.documentoId!).filter((id) => !disponiveis.has(id))));
    }).catch(() => { if (!controller.signal.aborted) setErroDisponibilidade(true); });
    return () => controller.abort();
  }, [editando, negocioId, tentativaDisponibilidade]);

  useEffect(() => {
    aoAlterarRascunho(JSON.stringify(dados) !== JSON.stringify(inicial) || contas.length > 0);
  }, [dados, inicial, contas, aoAlterarRascunho]);
  useEffect(() => () => aoAlterarRascunho(false), [aoAlterarRascunho]);

  function alterar<K extends keyof RascunhoProjetoSolar>(campo: K, valor: RascunhoProjetoSolar[K]) {
    setDados((atual) => ({ ...atual, [campo]: valor }));
  }

  async function anexar(arquivos: File[]) {
    for (const arquivo of arquivos) {
      const localId = crypto.randomUUID();
      const invalido = validarArquivoDocumento(arquivo);
      if (invalido) {
        setContas((atuais) => [...atuais, { id: localId, nome: arquivo.name, tamanho: tamanhoDocumento(arquivo.size), estado: "erro", erro: invalido }]);
        continue;
      }
      setContas((atuais) => [...atuais, { id: localId, nome: arquivo.name, tamanho: tamanhoDocumento(arquivo.size), estado: "enviando" }]);
      try {
        const documento = await enviarDocumentoDoLead(negocioId, arquivo, "conta_de_energia");
        setContas((atuais) => atuais.map((item) => item.id === localId ? { ...item, estado: "pronto", documentoId: documento.id } : item));
        setDados((atual) => ({ ...atual, energyBillDocumentIds: [...atual.energyBillDocumentIds, documento.id] }));
      } catch (falha) {
        setContas((atuais) => atuais.map((item) => item.id === localId ? { ...item, estado: "erro", erro: falha instanceof Error ? falha.message : "Falha no envio." } : item));
      }
    }
  }

  function removerConta(localId: string) {
    const alvo = contas.find((item) => item.id === localId);
    setContas((atuais) => atuais.filter((item) => item.id !== localId));
    if (alvo?.documentoId) {
      setDados((atual) => ({ ...atual, energyBillDocumentIds: atual.energyBillDocumentIds.filter((id) => id !== alvo.documentoId) }));
    }
  }

  const modal = (
    <Dialog
      title={editando ? "Editar projeto" : "Novo projeto"}
      description={editando
        ? "Atualize os dados deste projeto Solar. As alterações ficam só nesta ficha."
        : "Cadastre o projeto Solar deste lead. Ele fica só nesta ficha."}
      icon={editando ? <Pencil /> : <Sun />}
      size="media"
      onClose={() => { if (!ocupado) aoFechar(); }}
      footer={
        <Button
          variant="primary"
          icon={editando ? <Save /> : <Plus />}
          loading={salvando}
          disabled={ocupado}
          onClick={() => formulario.current?.requestSubmit()}
        >
          {editando ? "Salvar alterações" : "Criar projeto"}
        </Button>
      }
    >
      <form
        ref={formulario}
        className="ui-dialog-form"
        onSubmit={async (evento) => {
          evento.preventDefault();
          if (ocupado) return;
          const validacao = validarRascunhoProjetoSolar(dados);
          setErros(validacao);
          if (Object.keys(validacao).length) return;
          if (await aoSalvar(dados)) aoFechar();
        }}
      >
        {erro ? <Alert tone="danger" title={erro} /> : null}
        {naQualificacao ? <Alert tone="info" title="Salvar conclui a Qualificação">Com tipo de instalação, consumo, UC e conta de energia, o lead avança para Cotações/Proposta e a tarefa de proposta é criada.</Alert> : null}

        <section className="ui-dialog-section" aria-labelledby="secao-dados-projeto">
          <div className="ui-dialog-section-header">
            <Heading as="h3" id="secao-dados-projeto" icon={<Sun />}>Dados do projeto</Heading>
            <p className="ui-dialog-section-desc">
              Tipo de instalação, consumo e UC são obrigatórios. Telhado, área, potência e investimento podem ser completados depois.
            </p>
          </div>

          <div className="ui-dialog-grid">
            <SelectField
              id="projeto-instalacao"
              label="Tipo de instalação"
              required
              value={dados.installationType || undefined}
              error={erros.installationType}
              disabled={ocupado}
              placeholder="Selecione"
              onChange={(valor) => alterar("installationType", valor as RascunhoProjetoSolar["installationType"])}
              options={Object.entries(ROTULO_INSTALACAO_SOLAR).map(([value, label]) => ({
                value,
                label,
                icon: ICONE_INSTALACAO[value as LeadSolarInstallationType],
              }))}
            />
            <TextField
              id="projeto-consumo"
              label="Consumo médio (kWh)"
              required
              value={dados.averageConsumptionKwh}
              error={erros.averageConsumptionKwh}
              disabled={ocupado}
              onChange={(evento) => alterar("averageConsumptionKwh", evento.target.value)}
            />
          </div>

          <div className="ui-dialog-grid">
            <TextField
              id="projeto-uc"
              label="Unidade consumidora (UC)"
              required
              value={dados.consumerUnit}
              error={erros.consumerUnit}
              disabled={ocupado}
              onChange={(evento) => alterar("consumerUnit", evento.target.value)}
            />
            <SelectField
              id="projeto-telhado"
              label="Tipo de telhado"
                            value={dados.roofType || undefined}
              error={erros.roofType}
              disabled={ocupado}
              placeholder="Opcional"
              onChange={(valor) => alterar("roofType", valor as RascunhoProjetoSolar["roofType"])}
              options={Object.entries(ROTULO_TELHADO_SOLAR).map(([value, label]) => ({
                value,
                label,
                icon: ICONE_TELHADO[value as LeadSolarRoofType],
              }))}
            />
          </div>

          <div className="ui-dialog-grid">
            <TextField
              id="projeto-area"
              label="Área disponível (m²)"
                            value={dados.availableAreaM2}
              error={erros.availableAreaM2}
              disabled={ocupado}
              onChange={(evento) => alterar("availableAreaM2", evento.target.value)}
            />
            <TextField
              id="projeto-potencia"
              label="Potência estimada (kWp)"
                            value={dados.estimatedPowerKwp}
              error={erros.estimatedPowerKwp}
              disabled={ocupado}
              onChange={(evento) => alterar("estimatedPowerKwp", evento.target.value)}
            />
          </div>

          <TextField
            id="projeto-investimento"
            label="Investimento estimado (R$)"
                        value={dados.estimatedInvestment}
            error={erros.estimatedInvestment}
            disabled={ocupado}
            onChange={(evento) => alterar("estimatedInvestment", evento.target.value)}
          />
        </section>

        <section className="ui-dialog-section" aria-labelledby="secao-ucs-beneficiarias">
          <div className="ui-dialog-section-header">
            <Heading as="h3" id="secao-ucs-beneficiarias" icon={<Zap />}>UCs beneficiárias</Heading>
            <p className="ui-dialog-section-desc">Opcional. Outras unidades atendidas pelo mesmo projeto, diferentes da UC principal.</p>
          </div>
          {dados.beneficiaryUcs.map((uc, indice) => <div key={uc.id} className={styles.beneficiaria}>
            <TextField
              id={`projeto-beneficiaria-${uc.id}`}
              label={`UC beneficiária ${indice + 1}`}
              value={uc.code}
              disabled={ocupado}
              onChange={(evento) => alterar("beneficiaryUcs", dados.beneficiaryUcs.map((item) => item.id === uc.id ? { ...item, code: evento.target.value } : item))}
            />
            <Button type="button" variant="secondary" size="sm" icon={<X />} iconOnly aria-label={`Remover UC beneficiária ${indice + 1}`} disabled={ocupado}
              onClick={() => alterar("beneficiaryUcs", dados.beneficiaryUcs.filter((item) => item.id !== uc.id))} />
          </div>)}
          {erros.beneficiaryUcs ? <p className="ui-field-error" role="alert">{erros.beneficiaryUcs}</p> : null}
          <Button type="button" variant="secondary" size="sm" icon={<Plus size={14} />} disabled={ocupado || dados.beneficiaryUcs.length >= 50}
            onClick={() => alterar("beneficiaryUcs", [...dados.beneficiaryUcs, { id: crypto.randomUUID(), code: "" }])}>Adicionar UC beneficiária</Button>
        </section>

        <section className="ui-dialog-section" aria-labelledby="secao-contas-energia">
          <div className="ui-dialog-section-header">
            <Heading as="h3" id="secao-contas-energia" icon={<Upload />}>Contas de energia</Heading>
            <p className="ui-dialog-section-desc">
              {naQualificacao ? "Obrigatória para concluir a Qualificação. " : ""}Anexe as contas usadas neste projeto. Elas ficam também na aba Documentos.
            </p>
          </div>

          {erroDisponibilidade ? <div role="alert" className="aviso aviso--erro">
            <p>Não foi possível verificar a disponibilidade das contas.</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => setTentativaDisponibilidade((valor) => valor + 1)}>Tentar novamente</Button>
          </div> : null}

          <div
            className={`${styles.drop} ${arrastando ? styles.dropAtivo : ""}`}
            role="button"
            tabIndex={0}
            onKeyDown={(evento) => { if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); input.current?.click(); } }}
            onClick={() => { if (!ocupado) input.current?.click(); }}
            onDragEnter={(evento) => { evento.preventDefault(); arrastos.current += 1; setArrastando(true); }}
            onDragOver={(evento) => evento.preventDefault()}
            onDragLeave={(evento) => { evento.preventDefault(); arrastos.current = Math.max(0, arrastos.current - 1); if (!arrastos.current) setArrastando(false); }}
            onDrop={(evento) => {
              evento.preventDefault();
              arrastos.current = 0;
              setArrastando(false);
              if (!ocupado) void anexar(Array.from(evento.dataTransfer.files ?? []));
            }}
          >
            <Upload size={18} aria-hidden="true" />
            <strong>Arraste as contas de energia ou clique para selecionar</strong>
            <p>PDF, JPG ou PNG. Até 25 MB por arquivo.</p>
          </div>
          <input
            ref={input}
            hidden
            type="file"
            multiple
            accept={FORMATOS_DOCUMENTO}
            onChange={(evento) => {
              void anexar(Array.from(evento.target.files ?? []));
              evento.target.value = "";
            }}
          />
          {contas.length ? <div className={styles.contas}>
            {contas.map((conta) => (
              <div key={conta.id} className={styles.conta}>
                <FileText size={18} aria-hidden="true" />
                <div>
                  <strong>{conta.nome}</strong>
                  <small>{conta.tamanho} · {conta.estado === "enviando" ? "Enviando…" : conta.estado === "pronto" ? "Anexada" : "Erro"}</small>
                  {conta.erro ? <p className="ui-field-error" role="alert">{conta.erro}</p> : null}
                  {conta.documentoId && contasIndisponiveis.has(conta.documentoId)
                    ? <p className="ui-field-error" role="alert">Conta indisponível (reclassificada ou arquivada). É preservada até você removê-la ou anexar outra.</p>
                    : null}
                </div>
                <Button variant="secondary" size="sm" icon={<X />} iconOnly aria-label={`Remover ${conta.nome}`} disabled={ocupado && conta.estado === "enviando"} onClick={() => removerConta(conta.id)} />
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" icon={<Plus size={14} />} disabled={ocupado} onClick={() => input.current?.click()}>Adicionar mais contas</Button>
          </div> : null}
        </section>
      </form>
    </Dialog>
  );

  return typeof document === "undefined" ? null : createPortal(modal, document.body);
}
