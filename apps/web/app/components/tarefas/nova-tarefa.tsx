"use client";

import type { DepartamentoComTarefas, OpcoesDeTarefasResposta, Tarefa } from "@plugga/shared";
import { Building2, CalendarCheck, CalendarDays, CheckCircle2, Clock, Layers, ListChecks, Plus, Repeat, Tag, UserRound, Users, X } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";

import {
  corpoDaNovaTarefa,
  diaCurtoDaTarefa,
  HORARIOS_LIMITE,
  previaDoRascunho,
  rascunhoVazio,
  recorrenciasDaTela,
  ROTULO_DA_EMPRESA_DA_TAREFA,
  ROTULO_DA_RECORRENCIA,
  type ProblemasDoRascunho,
  type RascunhoDeTarefa,
} from "../../lib/tarefas";
import { PontoDaEmpresa } from "../suprimentos/empresa";
import { CampoDeMenu } from "../suprimentos/menu-com-busca";
import { Alert, Button, Checkbox, DatePicker, Dialog, TextField } from "../ui";
import { criarTarefa } from "./envios";
import styles from "./tarefas.module.css";

/** De segunda a sexta, como no protótipo. */
const DIAS_UTEIS = [[1, "seg"], [2, "ter"], [3, "qua"], [4, "qui"], [5, "sex"]] as const;

/**
 * Nova tarefa (protótipo de 23/11/2026): única ou recorrente, com responsável,
 * substituto, horário-limite e o que conta como feito. A prévia das próximas
 * ocorrências sai das regras puras do contrato, sem chamar a API.
 */
export function NovaTarefa({ departamento, opcoes, exemplo, empresaInicial, hoje, aoCancelar, aoCriar }: {
  departamento: DepartamentoComTarefas;
  opcoes: OpcoesDeTarefasResposta;
  exemplo: { titulo: string; item: string };
  empresaInicial?: "plugga" | "waze";
  hoje: string;
  aoCancelar: () => void;
  aoCriar: (t: Tarefa) => void;
}) {
  const [r, setR] = useState<RascunhoDeTarefa>(() => rascunhoVazio(hoje, empresaInicial));
  const [erros, setErros] = useState<ProblemasDoRascunho>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [item, setItem] = useState("");
  const mudar = (parcial: Partial<RascunhoDeTarefa>) => { setR((x) => ({ ...x, ...parcial })); setErros((e) => ({ ...e, ...Object.fromEntries(Object.keys(parcial).map((k) => [k, undefined])) })); };
  const previa = previaDoRascunho(r, hoje);
  const pessoas = opcoes.pessoas.map((p) => ({ value: p.id, label: p.nome, icon: <UserRound /> }));

  function adicionarItem() {
    const texto = item.trim();
    if (!texto || r.instrucoes.length >= 20) return;
    mudar({ instrucoes: [...r.instrucoes, texto] }); setItem("");
  }
  function teclarItem(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "Enter") { evento.preventDefault(); adicionarItem(); }
  }

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    const { problemas, corpo } = corpoDaNovaTarefa(r, hoje);
    setErros(problemas);
    if (!corpo) return;
    setEnviando(true); setFalha(null);
    const resposta = await criarTarefa(departamento, corpo);
    setEnviando(false);
    if (resposta.ok) { aoCriar(resposta.dados); return; }
    setErros((e) => ({ ...e, ...resposta.erro.porCampo }));
    setFalha(resposta.erro.mensagem);
  }

  return <Dialog title="Nova tarefa" size="media" className={styles.dialogoDaTarefa} icon={<CalendarCheck size={20} />} onClose={aoCancelar}
    description="Única ou recorrente, com responsável, prazo e o que conta como feito. Aparece em Tarefas no dia certo."
    footer={<Button type="submit" form="form-nova-tarefa" icon={<Plus size={15} />} disabled={enviando}>{enviando ? "Criando…" : "Criar tarefa"}</Button>}>
    <form id="form-nova-tarefa" className={`ui-dialog-form ${styles.formDaTarefa}`} onSubmit={criar} noValidate>
      {falha ? <Alert tone="danger" title={`Erro: ${falha}`} /> : null}
      <div className={styles.largo}><TextField label="Nome da tarefa" required maxLength={90} autoComplete="off" value={r.titulo} onChange={(e) => mudar({ titulo: e.target.value })} error={erros.titulo} placeholder={`Ex.: ${exemplo.titulo}`} /></div>
      <div className={`${styles.largo} ${styles.trio}`}>
        <CampoDeMenu label="Empresa" required icon={<Building2 />} placeholder="Selecione a empresa" value={r.empresa || undefined} onChange={(v) => mudar({ empresa: v as RascunhoDeTarefa["empresa"] })} error={erros.empresa}
          options={(["plugga", "waze", "ambas"] as const).map((e) => ({ value: e, label: ROTULO_DA_EMPRESA_DA_TAREFA[e], icon: e === "ambas" ? <Building2 /> : <PontoDaEmpresa empresa={e} /> }))} />
        <CampoDeMenu label="Responsável" required icon={<UserRound />} placeholder="Selecione a pessoa" value={r.responsavelId || undefined} onChange={(v) => mudar({ responsavelId: v, substitutoId: r.substitutoId === v ? "" : r.substitutoId })} error={erros.responsavelId} options={pessoas} />
        <CampoDeMenu label="Substituto (opcional)" icon={<Users />} placeholder="Sem substituto" value={r.substitutoId || "sem"} onChange={(v) => mudar({ substitutoId: v === "sem" ? "" : v })} error={erros.substitutoId} options={[{ value: "sem", label: "Sem substituto", icon: <Users /> }, ...pessoas.filter((p) => p.value !== r.responsavelId)]} />
      </div>
      {opcoes.categorias.length ? <div className={styles.largo}><CampoDeMenu label="Categoria (opcional)" icon={<Tag />} value={r.categoria || "sem"} onChange={(v) => mudar({ categoria: v === "sem" ? "" : v })}
        options={[{ value: "sem", label: "Sem categoria", icon: <Tag /> }, ...opcoes.categorias.map((c) => ({ value: c, label: c, icon: <Tag /> }))]} /></div> : null}

      <section className={`${styles.largo} ${styles.secaoDoForm}`} aria-labelledby="nt-quando">
        <h3 id="nt-quando"><Repeat size={15} aria-hidden="true" />Quando</h3>
        <div className={styles.duasColunas}>
          <CampoDeMenu label="Tipo" required icon={<Layers />} value={r.tipo} onChange={(v) => mudar({ tipo: v as RascunhoDeTarefa["tipo"] })}
            options={[{ value: "unica", label: "Única: acontece uma vez", icon: <CalendarDays /> }, { value: "recorrente", label: "Recorrente: se repete", icon: <Repeat /> }]} />
          <CampoDeMenu label="Horário-limite" required icon={<Clock />} value={r.horarioLimite} onChange={(v) => mudar({ horarioLimite: v })}
            options={HORARIOS_LIMITE.map((h) => ({ value: h, label: h, icon: <Clock /> }))} />
          {r.tipo === "unica"
            ? <div className={styles.largo}><DatePicker label="Data" required min={hoje} value={r.data} onChange={(v) => mudar({ data: v })} error={erros.data} /></div>
            : <>
              <CampoDeMenu label="Recorrência" required icon={<Repeat />} value={r.recorrencia} onChange={(v) => mudar({ recorrencia: v as RascunhoDeTarefa["recorrencia"] })}
                options={recorrenciasDaTela.map((x) => ({ value: x, label: ROTULO_DA_RECORRENCIA[x], icon: <Repeat /> }))} />
              <DatePicker label="Começa em" required min={hoje} value={r.inicio} onChange={(v) => mudar({ inicio: v })} error={erros.inicio} />
              {r.recorrencia === "dias_da_semana" ? <div className={`ui-field ${styles.largo}`}>
                <span className={styles.rotulo} id="nt-dias">Dias da semana<span className="ui-required"> (obrigatório)</span></span>
                <div className={styles.dias} role="group" aria-labelledby="nt-dias">
                  {DIAS_UTEIS.map(([d, nome]) => <button key={d} type="button" className={styles.dia} aria-pressed={r.dias.includes(d)}
                    onClick={() => mudar({ dias: r.dias.includes(d) ? r.dias.filter((x) => x !== d) : [...r.dias, d] })}>{nome}</button>)}
                </div>
                {erros.dias ? <p className="ui-field-error">Erro: {erros.dias}</p> : null}
              </div> : null}
              {r.recorrencia === "mensal_dia" ? <TextField label="Dia do mês" required inputMode="numeric" maxLength={2} value={r.diaDoMes} onChange={(e) => mudar({ diaDoMes: e.target.value })} error={erros.diaDoMes} hint="De 1 a 28, para valer em todos os meses." /> : null}
            </>}
        </div>
        <div className={styles.previaDoForm} aria-live="polite">
          <span><CalendarDays size={14} aria-hidden="true" />{r.tipo === "recorrente" ? "Próximas ocorrências" : "Acontece uma vez"}</span>
          <div className={styles.previa}>{previa.length
            ? previa.map((d) => <span key={d} className={d === hoje ? styles.ocorrenciaHoje : undefined}>{diaCurtoDaTarefa(d, hoje)} · {r.horarioLimite}</span>)
            : <span className={styles.muted}>{r.tipo === "recorrente" ? "Complete a recorrência para ver as datas." : "Escolha a data, de hoje em diante."}</span>}</div>
        </div>
        <p className={styles.muted}>Feriado conta como dia útil.</p>
      </section>

      <section className={`${styles.largo} ${styles.secaoDoForm}`} aria-labelledby="nt-feito">
        <h3 id="nt-feito"><CheckCircle2 size={15} aria-hidden="true" />O que conta como feito</h3>
        <div className={styles.duasColunas}>
          <Checkbox label="Exige evidência" description="Anexo ou print ao concluir" checked={r.exigeEvidencia} className={styles.opcao} onChange={(e) => mudar({ exigeEvidencia: e.target.checked })} />
          <Checkbox label="Exige resultado" description="Um texto curto com o que foi feito ou encontrado" checked={r.exigeResultado} className={styles.opcao} onChange={(e) => mudar({ exigeResultado: e.target.checked })} />
        </div>
        {erros.exigeEvidencia ? <p className="ui-field-error" role="alert">Erro: {erros.exigeEvidencia}</p> : null}
      </section>

      <section className={`${styles.largo} ${styles.secaoDoForm}`} aria-labelledby="nt-instrucoes">
        <h3 id="nt-instrucoes"><ListChecks size={15} aria-hidden="true" />Instruções</h3>
        {r.instrucoes.length ? <ol className={styles.itens}>{r.instrucoes.map((texto, i) => <li key={`${i}-${texto}`}>
          <span>{texto}</span>
          <Button variant="secondary" size="sm" iconOnly icon={<X size={14} />} aria-label={`Tirar o item ${texto}`} title="Tirar" onClick={() => mudar({ instrucoes: r.instrucoes.filter((_, j) => j !== i) })} />
        </li>)}</ol> : null}
        <div className={styles.adicionar}>
          <div className="ui-input-wrap"><input className="ui-input" autoComplete="off" maxLength={200} value={item} onChange={(e) => setItem(e.target.value)} onKeyDown={teclarItem}
            placeholder={`Ex.: ${exemplo.item}`} aria-label="Novo item do checklist" /></div>
          <Button variant="secondary" icon={<Plus size={15} />} onClick={adicionarItem} disabled={!item.trim() || r.instrucoes.length >= 20}>Adicionar</Button>
        </div>
        <p className="ui-field-hint">Viram um checklist na hora de concluir a tarefa.</p>
      </section>
    </form>
  </Dialog>;
}
