import Anthropic from "@anthropic-ai/sdk";

// Lê o PDF de uma nota fiscal (NF-e, NFS-e ou outro documento fiscal) com o Claude e devolve os dados num formato
// fixo (saída estruturada): emitente, tomador, número, valores, retenções e as duplicatas/vencimentos, se houver.

export type NotaLida = {
  tipo_documento: "NF-e" | "NFS-e" | "NFC-e" | "Outro";
  numero: string;
  serie: string | null;
  data_emissao: string | null;
  emitente: { documento: string; razao_social: string; nome_fantasia: string | null; municipio: string | null; uf: string | null };
  tomador: { documento: string | null; razao_social: string | null };
  descricao: string;
  codigo_servico: string | null;
  valor_total: number;
  valor_liquido: number;
  retencoes: { iss: number; irrf: number; inss: number; pis: number; cofins: number; csll: number };
  duplicatas: { numero: string | null; vencimento: string; valor: number }[];
  forma_pagamento: string | null;
  observacoes: string | null;
};

const texto = { type: "string" } as const;
const textoOuNulo = { type: ["string", "null"] } as const;
const numero = { type: "number" } as const;
const objeto = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

const ESQUEMA = objeto({
  tipo_documento: { type: "string", enum: ["NF-e", "NFS-e", "NFC-e", "Outro"] },
  numero: { ...texto, description: "Número da nota, só os dígitos (sem zeros à esquerda)" },
  serie: textoOuNulo,
  data_emissao: { ...textoOuNulo, description: "AAAA-MM-DD" },
  emitente: objeto({
    documento: { ...texto, description: "CNPJ ou CPF do emitente (prestador/fornecedor), só os dígitos" },
    razao_social: texto,
    nome_fantasia: textoOuNulo,
    municipio: textoOuNulo,
    uf: textoOuNulo,
  }),
  tomador: objeto({
    documento: { ...textoOuNulo, description: "CNPJ ou CPF do tomador/destinatário, só os dígitos" },
    razao_social: textoOuNulo,
  }),
  descricao: { ...texto, description: "Resumo curto do que foi vendido ou prestado (até 120 caracteres)" },
  codigo_servico: { ...textoOuNulo, description: "Código do serviço da NFS-e (lista da LC 116), se houver" },
  valor_total: { ...numero, description: "Valor total da nota (produtos/serviços), em reais" },
  valor_liquido: { ...numero, description: "Valor líquido a pagar ao emitente depois das retenções destacadas; igual ao total se não houver retenção" },
  retencoes: objeto({
    iss: { ...numero, description: "ISS retido pelo tomador (0 se não retido)" },
    irrf: numero,
    inss: numero,
    pis: numero,
    cofins: numero,
    csll: numero,
  }),
  duplicatas: {
    type: "array",
    description: "Parcelas/duplicatas com vencimento informadas na nota (quadro Fatura/Duplicatas, vencimento do boleto ou da NFS-e). Vazio se a nota não informar vencimento.",
    items: objeto({ numero: textoOuNulo, vencimento: { ...texto, description: "AAAA-MM-DD" }, valor: numero }),
  },
  forma_pagamento: { ...textoOuNulo, description: "Forma ou condição de pagamento escrita na nota (ex.: boleto, à vista, PIX, 30/60/90), ou null" },
  observacoes: { ...textoOuNulo, description: "Informação relevante para o pagamento (ex.: dados bancários, observação do emitente), ou null" },
});

export async function lerNotaFiscal(pdf: ArrayBuffer): Promise<{ nota?: NotaLida; erro?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { erro: "A chave da API da Anthropic (ANTHROPIC_API_KEY) não está configurada no servidor." };
  const client = new Anthropic();
  try {
    const resposta = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") } },
            {
              type: "text",
              text:
                "Extraia os dados desta nota fiscal brasileira para lançar no contas a pagar. Valores em reais como número (ponto decimal). " +
                "Datas em AAAA-MM-DD. Documentos (CNPJ/CPF) só com os dígitos. Retenção só quando a nota destaca o valor retido; caso contrário 0. " +
                "Se algum campo não existir na nota, use null (ou lista vazia nas duplicatas). Não invente dados.",
            },
          ],
        },
      ],
    });
    if (resposta.stop_reason === "refusal") return { erro: "O modelo recusou a leitura deste arquivo. Confira se é a nota fiscal certa." };
    if (resposta.stop_reason === "max_tokens") return { erro: "A leitura da nota foi interrompida. Tente de novo." };
    const textoJson = resposta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const nota = JSON.parse(textoJson) as NotaLida;
    nota.emitente.documento = nota.emitente.documento.replace(/\D/g, "");
    if (nota.tomador.documento) nota.tomador.documento = nota.tomador.documento.replace(/\D/g, "");
    return { nota };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { erro: "Limite de uso da API atingido. Tente de novo em alguns minutos." };
    if (e instanceof Anthropic.APIError) return { erro: `Erro da API da Anthropic (${e.status ?? "sem status"}): ${e.message}` };
    if (e instanceof SyntaxError) return { erro: "Não consegui interpretar a leitura da nota. Tente de novo." };
    return { erro: `Erro ao ler a nota: ${e instanceof Error ? e.message : String(e)}` };
  }
}
