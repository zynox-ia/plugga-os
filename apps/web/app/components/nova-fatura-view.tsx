"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import type {
  ConsumerUnitSummary,
  InvoiceReading,
  ReconciledInvoiceItem,
} from "@plugga/shared";

import { abrirEstudoPelaFatura, lerFaturaEnviada } from "../energia-opm/eficiencia/actions";
import {
  avaliarConciliacaoLocal,
  camposDaFicha,
  inferirCategoriaDaLinha,
} from "./conciliacao-model";
import { EditorConciliacao } from "./conciliacao-editor";
import { ShellCard, ShellTable, StatusPill } from "./plugga-shell";

/**
 * Abrir estudo a partir da conta de luz.
 *
 * A ordem importa: o que a pessoa tem na mão é a fatura, não o cadastro da
 * unidade consumidora. Soltar o arquivo é o primeiro passo, e a unidade e a
 * competência saem dele.
 *
 * Aceita o que a pessoa tem: PDF da distribuidora, foto da conta, digitalização
 * do escritório. Três quartos do acervo real são imagem, e a versão anterior
 * recusava tudo isso na porta — dizia "foto da conta ainda não é lida" e
 * mandava digitar quinze campos à mão.
 *
 * A tela continua sem esconder o que não foi lido, e agora distingue os
 * motivos: PDF com senha pede a senha, foto ilegível pede outra foto, layout
 * desconhecido leva à ficha manual. Preencher com zeros seria pior do que não
 * preencher.
 */

// `minimo` presente onde o contrato (invoiceDataSchema) exige positivo:
// min=0 deixaria o navegador aceitar o que a API recusa com 400.
const CAMPOS: { nome: string; rotulo: string; passo?: string; minimo?: string }[] = [
  { nome: "valorTotal", rotulo: "Valor total da fatura (R$)", passo: "0.01", minimo: "0.01" },
  { nome: "consumoPontaKwh", rotulo: "Consumo ponta (kWh)" },
  { nome: "consumoForaPontaKwh", rotulo: "Consumo fora ponta (kWh)" },
  { nome: "tarifaPonta", rotulo: "Tarifa ponta (R$/kWh)", passo: "0.000001" },
  { nome: "tarifaForaPonta", rotulo: "Tarifa fora ponta (R$/kWh)", passo: "0.000001" },
  { nome: "valorPonta", rotulo: "Valor da energia em ponta (R$)", passo: "0.01" },
  { nome: "valorForaPonta", rotulo: "Valor da energia fora ponta (R$)", passo: "0.01" },
  { nome: "valorDemanda", rotulo: "Valor da demanda (R$)", passo: "0.01" },
  { nome: "demandaContratadaKw", rotulo: "Demanda contratada (kW)", minimo: "0.01" },
  { nome: "demandaMedidaPontaKw", rotulo: "Demanda medida em ponta (kW)" },
  { nome: "demandaMedidaForaPontaKw", rotulo: "Demanda medida fora ponta (kW)" },
  { nome: "tarifaDemanda", rotulo: "Tarifa de demanda (R$/kW)", passo: "0.01" },
  { nome: "valorReativo", rotulo: "Energia reativa (R$)", passo: "0.01" },
  { nome: "valorBeneficioFiscal", rotulo: "Benefício fiscal (R$)", passo: "0.01" },
  { nome: "valorMultasJurosEncargos", rotulo: "Multas, juros e encargos (R$)", passo: "0.01" },
];

/**
 * Cada motivo diz o que aconteceu e o que fazer a respeito.
 *
 * A versão anterior tinha uma frase para quase tudo — "a fatura é uma imagem
 * digitalizada, sem texto para ler" — e ela aparecia inclusive para PDFs que só
 * estavam protegidos por senha. A pessoa recebia um pedido de trabalho manual
 * onde bastava informar a senha.
 */
const MOTIVO: Record<string, string> = {
  protegido_por_senha: "Este PDF está protegido por senha.",
  senha_incorreta: "A senha informada não abre este PDF.",
  sem_texto: "Não foi possível reconhecer texto neste arquivo.",
  layout_desconhecido: "O layout desta distribuidora ainda não é reconhecido.",
  grupo_b: "Esta é uma fatura do Grupo B (baixa tensão); o estudo é para Grupo A.",
  campos_essenciais_ausentes: "A leitura não encontrou consumo e tarifas completos.",
};

/**
 * Por que a leitura por modelo não entrou — e o que isso muda para quem confere.
 *
 * O primeiro é o que esta tela existe para não esconder: a fatura **não foi**
 * **enviada** a lugar nenhum, porque só vai para provedor que se compromete a não
 * guardar o conteúdo e nenhum estava disponível. Sem esta frase, o resultado
 * seria idêntico ao de um leitor que tentou e não deu conta, e a exigência de
 * retenção ficaria sem provedor por semanas sem ninguém perceber.
 */
const VISAO_PULADA: Record<string, string> = {
  sem_provedor_sem_retencao:
    "A leitura por modelo não foi feita: esta fatura só é enviada a provedor que não guarda o " +
    "conteúdo, e nenhum estava disponível — nada saiu daqui. O que aparece abaixo veio só das regras.",
  modelo_indisponivel:
    "A leitura por modelo não foi feita: o serviço não estava disponível. O que aparece abaixo " +
    "veio só das regras.",
  resposta_ilegivel:
    "A leitura por modelo não pôde ser aproveitada: a resposta veio ilegível. O que aparece " +
    "abaixo veio só das regras.",
};

/** Motivos que a pessoa resolve ali mesmo, sem cair na ficha manual. */
const PEDE_SENHA = new Set(["protegido_por_senha", "senha_incorreta"]);

/** Abaixo disto o reconhecimento óptico erra o bastante para valer o aviso. */
const CONFIANCA_BAIXA = 75;

const dinheiro = (valor: number): string =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/[\u00a0\u202f]/g, " ");

/** Compara códigos de UC ignorando pontuação: a fatura e o cadastro divergem. */
const soDigitos = (texto: string): string => texto.replace(/\D/g, "");

export function NovaFaturaView({
  consumerUnits,
  onCancelar,
}: {
  consumerUnits: ConsumerUnitSummary[];
  onCancelar: () => void;
}) {
  const router = useRouter();
  const [leitura, setLeitura] = useState<InvoiceReading | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const campoArquivo = useRef<HTMLInputElement>(null);
  // O arquivo fica guardado para o caso de o PDF pedir senha: sem isto, a
  // pessoa teria de escolher o mesmo arquivo de novo só para digitar a senha.
  const [arquivoEnviado, setArquivoEnviado] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [estudoCriado, setEstudoCriado] = useState<string | null>(null);
  const [itensConciliacao, setItensConciliacao] = useState<ReconciledInvoiceItem[]>([]);

  const ucCasada = leitura?.unidadeConsumidoraCodigo
    ? consumerUnits.find(
        (uc) => soDigitos(uc.code) === soDigitos(leitura.unidadeConsumidoraCodigo ?? ""),
      )
    : undefined;

  // A ficha é controlada por estado, não por defaultValue: o React 19 reseta o
  // <form action> quando a ação termina — inclusive em erro. Com campos livres,
  // um 400 da API apagava os quinze valores que a pessoa digitou lendo o papel;
  // campo controlado sobrevive ao reset. Os `name` ficam: é o FormData deles
  // que a ação lê.
  const [ficha, setFicha] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!leitura) return;
    const codigo = leitura.unidadeConsumidoraCodigo;
    const casada = codigo
      ? consumerUnits.find((uc) => soDigitos(uc.code) === soDigitos(codigo))
      : undefined;
    const base: Record<string, string> = {
      consumerUnitId: casada?.id ?? "",
      clientId: casada?.clientId ?? "",
      competenceMonth: String(leitura.competenceMonth ?? ""),
      competenceYear: String(leitura.competenceYear ?? ""),
      demandHistory: "",
      hasLoadProfile: "",
      distribuidora: leitura.distribuidora ?? "",
      regime: "cativo",
      modalidade: "verde",
      vencimento: "",
    };
    for (const campo of CAMPOS) {
      const lido = leitura.invoice[campo.nome as keyof typeof leitura.invoice];
      base[campo.nome] = String(lido ?? 0);
    }
    setFicha(base);
    setItensConciliacao(
      leitura.itens.map((item) => ({
        nome: item.rotulo,
        categoria: inferirCategoriaDaLinha(item.rotulo),
        // A leitura já decide isso pela aritmética da própria fatura: item de
        // bandeira que faz a soma passar do total nasce fora dele. A pessoa
        // continua podendo mudar aqui — a leitura sugere, não decide sozinha.
        compoeTotal: item.compoeTotal,
        valor: item.valor,
        quantidade: item.quantidade,
        unidade: item.unidade,
        tarifa: item.tarifa,
      })),
    );
  }, [leitura, consumerUnits]);

  const alterarCampo = (nome: string, valor: string) =>
    setFicha((atual) => ({ ...atual, [nome]: valor }));

  function enviar(arquivo: File, senhaDoPdf?: string) {
    setErro(null);
    setArquivoEnviado(arquivo);
    // Fatura nova, intenção nova: o estudo pendurado da tentativa anterior
    // não deve receber a ficha de outra conta de luz.
    setEstudoCriado(null);

    const dados = new FormData();
    dados.append("arquivo", arquivo);
    if (senhaDoPdf) dados.append("senha", senhaDoPdf);

    iniciar(async () => {
      const resultado = await lerFaturaEnviada(dados);
      if (resultado.ok) setLeitura(resultado.leitura);
      else setErro(resultado.erro);
    });
  }

  function trocarArquivo() {
    setLeitura(null);
    setArquivoEnviado(null);
    setSenha("");
    setErro(null);
    setEstudoCriado(null);
  }

  function abrir(formData: FormData) {
    setErro(null);
    iniciar(async () => {
      const resultado = await abrirEstudoPelaFatura(formData, estudoCriado ?? undefined);
      if (resultado.ok) {
        router.push(`/energia-opm/eficiencia/${resultado.id}`);
        return;
      }
      // O estudo pode ter sido criado antes de a ficha falhar: guardado, a
      // retentativa completa o MESMO estudo em vez de abrir um segundo.
      if (resultado.estudoCriado) setEstudoCriado(resultado.estudoCriado);
      setErro(resultado.erro);
    });
  }

  if (!leitura) {
    return (
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Passo 1</span>
            <h2>Solte a conta de luz</h2>
          </div>
          <button className="button" type="button" onClick={onCancelar}>
            Cancelar
          </button>
        </div>

        <div
          className={`solta-fatura${arrastando ? " solta-fatura--ativa" : ""}`}
          onDragOver={(evento) => {
            evento.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(evento) => {
            evento.preventDefault();
            setArrastando(false);
            const arquivo = evento.dataTransfer.files[0];
            if (arquivo) enviar(arquivo);
          }}
          onClick={() => campoArquivo.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(evento) => {
            if (evento.key === "Enter" || evento.key === " ") campoArquivo.current?.click();
          }}
        >
          <strong>{pendente ? "Lendo a fatura…" : "Arraste a conta de luz aqui"}</strong>
          <span>PDF, foto ou digitalização — ou clique para escolher o arquivo</span>
          <input
            ref={campoArquivo}
            type="file"
            // `capture` fica de fora de propósito: no celular ele forçaria a
            // câmera e tiraria a opção de escolher um arquivo já salvo, que é
            // como a conta costuma chegar por e-mail ou WhatsApp.
            accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,image/tiff,.jpg,.jpeg,.png"
            hidden
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) enviar(arquivo);
            }}
          />
        </div>

        <p className="card-note">
          A unidade consumidora, a competência, o valor total e a demanda contratada saem da
          própria fatura. Foto e digitalização são lidas por reconhecimento óptico, e cada
          número lido é conferido pela aritmética da própria conta.
        </p>
        {erro ? <p className="auth-error">{erro}</p> : null}
      </ShellCard>
    );
  }

  // Senha não é fim de linha: o arquivo continua aqui, e o que falta é uma
  // informação que a pessoa tem. Mandá-la para a ficha manual seria pedir
  // quinze digitações para evitar uma.
  if (PEDE_SENHA.has(leitura.motivo ?? "") && arquivoEnviado) {
    return (
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Passo 2 · {leitura.arquivoNome}</span>
            <h2>Este PDF pede uma senha</h2>
          </div>
          <button className="button" type="button" onClick={trocarArquivo}>
            Trocar arquivo
          </button>
        </div>

        <p className="card-note">
          {MOTIVO[leitura.motivo ?? ""]} A distribuidora costuma usar o CPF ou o CNPJ do
          titular, só os números. A senha é usada para abrir o arquivo e não fica guardada.
        </p>

        <form
          className="fatura-form"
          onSubmit={(evento) => {
            evento.preventDefault();
            enviar(arquivoEnviado, senha);
          }}
        >
          <label>
            <span>Senha do PDF</span>
            <input
              name="senha"
              type="password"
              autoComplete="off"
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              autoFocus
            />
          </label>
          <button className="button button--accent" type="submit" disabled={pendente || !senha}>
            {pendente ? "Abrindo…" : "Abrir a fatura"}
          </button>
        </form>
        {erro ? <p className="auth-error">{erro}</p> : null}
      </ShellCard>
    );
  }

  const confirmados = leitura.itens.filter((item) => item.veredicto === "confirmado");
  const divergentes = leitura.itens.filter((item) => item.veredicto === "divergente");
  const avaliacaoConciliacao = avaliarConciliacaoLocal(
    itensConciliacao,
    camposDaFicha(ficha),
  );

  return (
    <>
      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Passo 2 · {leitura.arquivoNome}</span>
            <h2>Confira o que foi lido</h2>
          </div>
          <div className="page-actions">
            <StatusPill variant={leitura.aproveitavel ? "success" : "warning"}>
              {leitura.aproveitavel
                ? `${confirmados.length} itens conferidos`
                : "preenchimento manual"}
            </StatusPill>
            <button className="button" type="button" onClick={trocarArquivo}>
              Trocar arquivo
            </button>
          </div>
        </div>

        {!leitura.aproveitavel ? (
          <p className="card-note">
            {MOTIVO[leitura.motivo ?? ""] ?? "Não foi possível ler esta fatura."} Preencha os
            campos abaixo com o que está no papel — o cálculo é o mesmo.
          </p>
        ) : (
          <p className="card-note">
            Cada linha foi conferida pela própria fatura: <b>quantidade × tarifa = valor</b>. O que
            não fechou aparece em destaque e não foi aproveitado.
          </p>
        )}

        {leitura.visaoPulada !== null ? (
          <p className="card-note">{VISAO_PULADA[leitura.visaoPulada]}</p>
        ) : null}

        {leitura.origem === "reconhecimento_optico" ? (
          <p className="card-note">
            Os números saíram de uma imagem, por reconhecimento óptico
            {leitura.confiancaOcr !== null
              ? ` (confiança de ${Math.round(leitura.confiancaOcr)}%)`
              : ""}
            .{" "}
            {leitura.confiancaOcr !== null && leitura.confiancaOcr < CONFIANCA_BAIXA
              ? "A imagem está difícil de ler: confira item por item, ou envie uma foto mais nítida."
              : "A conferência aritmética abaixo é o que pega erro de leitura — vale um olhar antes de abrir o estudo."}
          </p>
        ) : null}

        {leitura.itens.length > 0 ? (
          <ShellTable caption="Itens lidos da fatura">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantidade</th>
                <th>Tarifa</th>
                <th>Valor</th>
                <th>Conferência</th>
              </tr>
            </thead>
            <tbody>
              {leitura.itens.map((item, i) => (
                <tr key={`${item.rotulo}-${i}`}>
                  <td>{item.rotulo}</td>
                  <td>
                    {item.quantidade === null
                      ? "—"
                      : `${item.quantidade.toLocaleString("pt-BR")} ${item.unidade ?? ""}`}
                  </td>
                  <td>{item.tarifa === null ? "—" : item.tarifa.toFixed(6)}</td>
                  <td>{dinheiro(item.valor)}</td>
                  <td>
                    {item.veredicto === "confirmado" ? (
                      <StatusPill variant="success">confere</StatusPill>
                    ) : item.veredicto === "divergente" ? (
                      <StatusPill variant="danger">
                        esperado {dinheiro(item.esperado ?? 0)}
                      </StatusPill>
                    ) : (
                      <StatusPill variant="neutral">sem conferência</StatusPill>
                    )}
                    {item.compoeTotal ? null : (
                      <span title={item.motivoForaDoTotal ?? undefined}>
                        <StatusPill variant="neutral">informativo, fora do total</StatusPill>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </ShellTable>
        ) : null}

        {divergentes.length > 0 ? (
          <p className="card-note">
            <b>{divergentes.length} item(ns) não fecharam.</b> Corrija quantidade, tarifa ou valor
            na conciliação abaixo antes de abrir o estudo.
          </p>
        ) : null}

        <h3>Conciliação que entra no estudo</h3>
        <p className="card-note">
          A soma precisa ser exatamente igual ao total da fatura. Acrescente linhas que o leitor
          não reconheceu; não altere o total apenas para fazê-lo fechar.
        </p>
        <EditorConciliacao
          itens={itensConciliacao}
          onChange={setItensConciliacao}
          avaliacao={avaliacaoConciliacao}
        />
      </ShellCard>

      <ShellCard className="panel-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Passo 3</span>
            <h2>Complete e abra o estudo</h2>
          </div>
        </div>

        <form className="fatura-form" action={abrir}>
          <input
            type="hidden"
            name="contextItems"
            value={JSON.stringify(avaliacaoConciliacao.itens)}
            readOnly
          />
          <input type="hidden" name="arquivoNome" value={leitura.arquivoNome} readOnly />
          <input type="hidden" name="arquivoChave" value={leitura.arquivoChave ?? ""} readOnly />
          <input
            type="hidden"
            name="origem"
            value={leitura.itens.length > 0 ? leitura.origem : "manual"}
            readOnly
          />
          <label>
            <span>Unidade consumidora</span>
            <select
              name="consumerUnitId"
              required
              value={ficha.consumerUnitId ?? ""}
              onChange={(evento) => {
                const uc = consumerUnits.find((item) => item.id === evento.target.value);
                setFicha((atual) => ({
                  ...atual,
                  consumerUnitId: evento.target.value,
                  clientId: uc?.clientId ?? "",
                }));
              }}
            >
              <option value="">Selecione…</option>
              {consumerUnits.map((uc) => (
                <option key={uc.id} value={uc.id}>
                  {uc.code} · {uc.clientName}
                </option>
              ))}
            </select>
            <small>
              {leitura.unidadeConsumidoraCodigo
                ? ucCasada
                  ? `Identificada na fatura: ${leitura.unidadeConsumidoraCodigo}`
                  : `A fatura diz ${leitura.unidadeConsumidoraCodigo}, que não está cadastrada — escolha ou cadastre a UC.`
                : "A fatura não trouxe o número da UC."}
            </small>
          </label>
          <input type="hidden" name="clientId" value={ficha.clientId ?? ""} readOnly />

          <label>
            <span>Distribuidora</span>
            <input
              name="distribuidora"
              type="text"
              value={ficha.distribuidora ?? ""}
              onChange={(evento) => alterarCampo("distribuidora", evento.target.value)}
              required
            />
          </label>
          <label>
            <span>Regime</span>
            <select
              name="regime"
              value={ficha.regime ?? "cativo"}
              onChange={(evento) => alterarCampo("regime", evento.target.value)}
            >
              <option value="cativo">Cativo</option>
              <option value="mercado_livre">Mercado Livre</option>
            </select>
          </label>
          <label>
            <span>Modalidade</span>
            <select
              name="modalidade"
              value={ficha.modalidade ?? "verde"}
              onChange={(evento) => alterarCampo("modalidade", evento.target.value)}
            >
              <option value="verde">Verde</option>
              <option value="azul">Azul</option>
            </select>
          </label>
          <label>
            <span>Vencimento</span>
            <input
              name="vencimento"
              type="text"
              placeholder="DD/MM/AAAA"
              value={ficha.vencimento ?? ""}
              onChange={(evento) => alterarCampo("vencimento", evento.target.value)}
            />
          </label>

          <label>
            <span>Mês</span>
            <input
              name="competenceMonth"
              type="number"
              min={1}
              max={12}
              value={ficha.competenceMonth ?? ""}
              onChange={(evento) => alterarCampo("competenceMonth", evento.target.value)}
              required
            />
          </label>
          <label>
            <span>Ano</span>
            <input
              name="competenceYear"
              type="number"
              min={2020}
              max={2100}
              value={ficha.competenceYear ?? ""}
              onChange={(evento) => alterarCampo("competenceYear", evento.target.value)}
              required
            />
          </label>

          {CAMPOS.map((campo) => {
            const lido = leitura.invoice[campo.nome as keyof typeof leitura.invoice];
            return (
              <label key={campo.nome} className={lido === undefined ? "campo-pendente" : undefined}>
                <span>{campo.rotulo}</span>
                <input
                  name={campo.nome}
                  type="number"
                  step={campo.passo ?? "1"}
                  min={campo.minimo ?? "0"}
                  value={ficha[campo.nome] ?? ""}
                  onChange={(evento) => alterarCampo(campo.nome, evento.target.value)}
                />
                {lido === undefined ? <small>não veio da fatura</small> : null}
              </label>
            );
          })}

          <label className="campo-largo">
            <span>Histórico de demanda registrada, mês a mês (kW)</span>
            <input
              name="demandHistory"
              type="text"
              placeholder="634, 704, 705, 698, 668, 586"
              value={ficha.demandHistory ?? ""}
              onChange={(evento) => alterarCampo("demandHistory", evento.target.value)}
            />
            <small>Separe por vírgula. Com doze meses a análise deixa de ser preliminar.</small>
          </label>
          <label className="campo-largo campo-checkbox">
            <input
              name="hasLoadProfile"
              type="checkbox"
              checked={ficha.hasLoadProfile === "on"}
              onChange={(evento) => alterarCampo("hasLoadProfile", evento.target.checked ? "on" : "")}
            />
            <span>Tenho memória de massa de 15 minutos</span>
          </label>

          <button
            className="button button--accent"
            type="submit"
            disabled={pendente || !avaliacaoConciliacao.pronta}
          >
            {pendente ? "Abrindo…" : "Abrir estudo e calcular"}
          </button>
          {erro ? <p className="auth-error">{erro}</p> : null}
        </form>
      </ShellCard>
    </>
  );
}
