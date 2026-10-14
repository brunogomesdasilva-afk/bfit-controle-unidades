import type { DocumentoWhatsapp, ProvedorWhatsapp } from "../tipos";

// WhatsApp Cloud API (oficial da Meta). Variáveis:
// - WHATSAPP_TOKEN: token permanente de um usuário do sistema do Meta Business (permissão whatsapp_business_messaging).
// - WHATSAPP_PHONE_NUMBER_ID: ID do número de envio (painel do app em developers.facebook.com > WhatsApp > Configuração da API).
// - WHATSAPP_TEMPLATE: nome do modelo de mensagem aprovado, com cabeçalho "Documento" e uma variável {{1}} no corpo.
//   Sem modelo, a mensagem sai como documento comum, que a Meta só entrega para quem falou com o número nas últimas 24h.
// - WHATSAPP_TEMPLATE_LANG (padrão pt_BR) e WHATSAPP_API_VERSION (padrão v23.0), opcionais.
// O arquivo é enviado para a própria Meta (upload de mídia) e a mensagem usa o ID devolvido: não precisa de link público.

const versao = () => process.env.WHATSAPP_API_VERSION || "v23.0";
const base = () => `https://graph.facebook.com/${versao()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
const autorizacao = () => ({ Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` });

const TIPOS: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};

async function erroDaMeta(resposta: Response) {
  const texto = await resposta.text();
  try {
    const { error } = JSON.parse(texto) as { error?: { message?: string; code?: number } };
    if (error?.message) return new Error(`${resposta.status} ${error.message}${error.code ? ` (código ${error.code})` : ""}`);
  } catch {}
  return new Error(`${resposta.status} ${texto.slice(0, 200)}`);
}

// O mesmo PDF vai para vários celulares: sobe uma vez só e reaproveita o ID da mídia.
const midias = new WeakMap<Uint8Array, Promise<string>>();

function subirMidia(arquivo: Uint8Array, nome: string) {
  let id = midias.get(arquivo);
  if (!id) {
    id = (async () => {
      const tipo = TIPOS[(nome.match(/\.([a-z0-9]+)$/i)?.[1] ?? "pdf").toLowerCase()] ?? "application/pdf";
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("type", tipo);
      form.append("file", new Blob([arquivo as Uint8Array<ArrayBuffer>], { type: tipo }), nome);
      const resposta = await fetch(`${base()}/media`, { method: "POST", headers: autorizacao(), body: form });
      if (!resposta.ok) throw await erroDaMeta(resposta);
      return ((await resposta.json()) as { id: string }).id;
    })();
    midias.set(arquivo, id);
    id.catch(() => midias.delete(arquivo)); // falhou: a próxima tentativa sobe de novo
  }
  return id;
}

// Variável de modelo não aceita quebra de linha, tabulação nem mais de 4 espaços seguidos.
const textoDeVariavel = (texto: string) => texto.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").slice(0, 1024);

export const meta: ProvedorWhatsapp = {
  nome: "WhatsApp Cloud API",
  configurado: () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  async sendDocument(d: DocumentoWhatsapp) {
    if (!/^\d+$/.test(d.to)) throw new Error("a Cloud API da Meta não envia para grupos (use a Z-API)");
    const documento = d.fileBuffer
      ? { id: await subirMidia(d.fileBuffer, d.fileName), filename: d.fileName }
      : d.fileUrl
        ? { link: d.fileUrl, filename: d.fileName }
        : null;
    if (!documento) throw new Error("arquivo não informado");
    const modelo = process.env.WHATSAPP_TEMPLATE;
    const mensagem = modelo
      ? {
          type: "template",
          template: {
            name: modelo,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR" },
            components: [
              { type: "header", parameters: [{ type: "document", document: documento }] },
              { type: "body", parameters: [{ type: "text", text: textoDeVariavel(d.caption) }] },
            ],
          },
        }
      : { type: "document", document: { ...documento, caption: d.caption } };
    const resposta = await fetch(`${base()}/messages`, {
      method: "POST",
      headers: { ...autorizacao(), "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: d.to, ...mensagem }),
    });
    if (!resposta.ok) throw await erroDaMeta(resposta);
  },
};
