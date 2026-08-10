/**
 * Comparador campo a campo entre o oráculo Python e o TypeScript.
 *
 * Três regras dão a forma deste arquivo:
 *
 * 1. igualdade exata é o padrão — quem quiser folga precisa declarar;
 * 2. não existe tolerância global; a folga é por campo, com justificativa;
 * 3. diferença sem registro reprova, e reprovar bloqueia CI e promoção.
 *
 * O estado `approved_divergence` nunca se disfarça de teste verde: ele aparece
 * no relatório e é levado ao walkthrough.
 */
import type { Divergencia } from "../divergencias.ts";

export type EstadoDaComparacao =
  | "exact"
  | "within_tolerance"
  | "approved_divergence"
  | "failed";

/** Folga declarada para um campo específico, com o porquê. */
export type ToleranciaDeCampo = {
  campo: string;
  absoluta: number;
  justificativa: string;
};

/** Liga uma divergência aprovada aos campos onde ela pode aparecer. */
export type DivergenciaAplicavel = {
  divergencia: Divergencia;
  campos: string[];
};

export type ComparacaoDeCampo = {
  campo: string;
  python: unknown;
  typescript: unknown;
  diferenca?: number;
  estado: EstadoDaComparacao;
  regra: string;
};

export type OpcoesDaComparacao = {
  tolerancias?: readonly ToleranciaDeCampo[];
  divergencias?: readonly DivergenciaAplicavel[];
};

const ordemDaGravidade: Record<EstadoDaComparacao, number> = {
  exact: 0,
  within_tolerance: 1,
  approved_divergence: 2,
  failed: 3,
};

const ausente = Symbol("ausente");

function achatar(
  valor: unknown,
  prefixo: string,
  destino: Map<string, unknown>,
): void {
  if (Array.isArray(valor)) {
    valor.forEach((item, indice) => achatar(item, `${prefixo}[${indice}]`, destino));
    return;
  }

  if (valor !== null && typeof valor === "object") {
    for (const [chave, filho] of Object.entries(valor)) {
      achatar(filho, prefixo ? `${prefixo}.${chave}` : chave, destino);
    }
    return;
  }

  destino.set(prefixo, valor);
}

export function achatarCampos(valor: unknown): Map<string, unknown> {
  const destino = new Map<string, unknown>();
  achatar(valor, "", destino);
  return destino;
}

function compararCampo(
  campo: string,
  python: unknown,
  typescript: unknown,
  opcoes: OpcoesDaComparacao,
): ComparacaoDeCampo {
  const base = { campo, python, typescript };

  if (python === ausente || typescript === ausente) {
    return {
      ...base,
      python: python === ausente ? undefined : python,
      typescript: typescript === ausente ? undefined : typescript,
      estado: "failed",
      regra:
        python === ausente
          ? "campo existe só no TypeScript"
          : "campo existe só no oráculo",
    };
  }

  if (Object.is(python, typescript)) {
    return { ...base, estado: "exact", regra: "igualdade exata" };
  }

  if (typeof python === "number" && typeof typescript === "number") {
    const diferenca = Math.abs(python - typescript);
    const tolerancia = opcoes.tolerancias?.find((t) => t.campo === campo);
    if (tolerancia && diferenca <= tolerancia.absoluta) {
      return {
        ...base,
        diferenca,
        estado: "within_tolerance",
        regra: `tolerância declarada de ${tolerancia.absoluta}: ${tolerancia.justificativa}`,
      };
    }

    const aplicavel = opcoes.divergencias?.find((d) => d.campos.includes(campo));
    if (aplicavel) {
      return {
        ...base,
        diferenca,
        estado: "approved_divergence",
        regra: `${aplicavel.divergencia.id}: ${aplicavel.divergencia.decisao}`,
      };
    }

    return {
      ...base,
      diferenca,
      estado: "failed",
      regra: "diferença numérica sem tolerância nem divergência registrada",
    };
  }

  const aplicavel = opcoes.divergencias?.find((d) => d.campos.includes(campo));
  if (aplicavel) {
    return {
      ...base,
      estado: "approved_divergence",
      regra: `${aplicavel.divergencia.id}: ${aplicavel.divergencia.decisao}`,
    };
  }

  return { ...base, estado: "failed", regra: "valores diferentes sem registro" };
}

export function compararSaidas(
  python: unknown,
  typescript: unknown,
  opcoes: OpcoesDaComparacao = {},
): ComparacaoDeCampo[] {
  const doPython = achatarCampos(python);
  const doTypeScript = achatarCampos(typescript);
  const campos = [...new Set([...doPython.keys(), ...doTypeScript.keys()])].sort();

  return campos.map((campo) =>
    compararCampo(
      campo,
      doPython.has(campo) ? doPython.get(campo) : ausente,
      doTypeScript.has(campo) ? doTypeScript.get(campo) : ausente,
      opcoes,
    ),
  );
}

/** O resultado da execução é o pior estado encontrado. */
export function resultadoGeral(
  campos: readonly ComparacaoDeCampo[],
): EstadoDaComparacao {
  return campos.reduce<EstadoDaComparacao>(
    (pior, campo) =>
      ordemDaGravidade[campo.estado] > ordemDaGravidade[pior] ? campo.estado : pior,
    "exact",
  );
}

export function camposReprovados(
  campos: readonly ComparacaoDeCampo[],
): ComparacaoDeCampo[] {
  return campos.filter((campo) => campo.estado === "failed");
}

export function divergenciasAplicadas(
  campos: readonly ComparacaoDeCampo[],
): ComparacaoDeCampo[] {
  return campos.filter((campo) => campo.estado === "approved_divergence");
}
