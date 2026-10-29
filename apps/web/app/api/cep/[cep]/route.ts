import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cep: string }> },
): Promise<Response> {
  const { cep } = await params;
  const digitos = cep.replace(/\D/g, "");
  if (digitos.length !== 8) {
    return NextResponse.json({ erro: "CEP inválido." }, { status: 400 });
  }

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, {
      headers: { "User-Agent": "PluggaOS/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!resposta.ok) {
      return NextResponse.json({ erro: "Falha na consulta ao CEP." }, { status: 502 });
    }
    const dados = (await resposta.json()) as {
      erro?: boolean | string;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
      complemento?: string;
    };
    if (dados.erro) {
      return NextResponse.json({ erro: "CEP não encontrado." }, { status: 404 });
    }
    return NextResponse.json({
      logradouro: dados.logradouro ?? "",
      bairro: dados.bairro ?? "",
      cidade: dados.localidade ?? "",
      uf: dados.uf ?? "",
      complemento: dados.complemento ?? "",
    });
  } catch {
    return NextResponse.json({ erro: "Não foi possível consultar o CEP." }, { status: 502 });
  }
}
