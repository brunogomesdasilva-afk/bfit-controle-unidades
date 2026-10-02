// Envio de relatórios por WhatsApp (teste com serviço não oficial: Z-API, https://z-api.io).
// Variáveis na Vercel: ZAPI_INSTANCIA, ZAPI_TOKEN e ZAPI_CLIENT_TOKEN (token de segurança da conta).
// Para trocar de serviço (ex.: API oficial da Meta), basta reescrever enviarDocumento().

export function whatsappConfigurado(): boolean {
  return Boolean(process.env.ZAPI_INSTANCIA && process.env.ZAPI_TOKEN);
}

// Celular só com dígitos e com o DDI do Brasil: "(11) 98888-7777" → "5511988887777". Vazio = inválido.
export function normalizarCelular(numero: string | null | undefined): string | null {
  const d = String(numero ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

async function enviarDocumento(celular: string, pdf: { nome: string; conteudo: Uint8Array }, legenda: string) {
  const url = `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCIA}/token/${process.env.ZAPI_TOKEN}/send-document/pdf`;
  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.ZAPI_CLIENT_TOKEN ? { "Client-Token": process.env.ZAPI_CLIENT_TOKEN } : {}),
    },
    body: JSON.stringify({
      phone: celular,
      document: `data:application/pdf;base64,${Buffer.from(pdf.conteudo).toString("base64")}`,
      fileName: pdf.nome.replace(/\.pdf$/i, ""),
      caption: legenda,
    }),
  });
  if (!resposta.ok) throw new Error(`${resposta.status} ${(await resposta.text()).slice(0, 200)}`);
}

// Envia o PDF com uma legenda para cada celular. Não lança erro: devolve quantos foram e as falhas.
export async function enviarWhatsapp(opcoes: { para: (string | null | undefined)[]; legenda: string; pdf: { nome: string; conteudo: Uint8Array } }) {
  const enviados: string[] = [];
  const falhas: string[] = [];
  if (!whatsappConfigurado()) return { enviados, falhas };
  const celulares = [...new Set(opcoes.para.map(normalizarCelular).filter((c): c is string => Boolean(c)))];
  for (const celular of celulares) {
    try {
      await enviarDocumento(celular, opcoes.pdf, opcoes.legenda);
      enviados.push(celular);
    } catch (e) {
      falhas.push(`WhatsApp ${celular}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }
  return { enviados, falhas };
}
