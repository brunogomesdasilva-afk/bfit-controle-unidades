import type { DocumentoWhatsapp, ProvedorWhatsapp } from "../tipos";

// Z-API (serviço não oficial, https://z-api.io): conecta um número já existente por QR code.
// Variáveis: ZAPI_INSTANCE_ID (ou ZAPI_INSTANCIA, nome antigo), ZAPI_TOKEN e ZAPI_CLIENT_TOKEN (token de segurança).

const instancia = () => process.env.ZAPI_INSTANCE_ID || process.env.ZAPI_INSTANCIA;

export const zapi: ProvedorWhatsapp = {
  nome: "Z-API",
  configurado: () => Boolean(instancia() && process.env.ZAPI_TOKEN),
  async sendDocument(d: DocumentoWhatsapp) {
    const extensao = (d.fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "pdf").toLowerCase();
    const url = `https://api.z-api.io/instances/${instancia()}/token/${process.env.ZAPI_TOKEN}/send-document/${extensao}`;
    const documento = d.fileBuffer
      ? `data:application/${extensao};base64,${Buffer.from(d.fileBuffer).toString("base64")}`
      : d.fileUrl;
    if (!documento) throw new Error("arquivo não informado");
    const resposta = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.ZAPI_CLIENT_TOKEN ? { "Client-Token": process.env.ZAPI_CLIENT_TOKEN } : {}),
      },
      body: JSON.stringify({
        phone: d.to,
        document: documento,
        fileName: d.fileName.replace(/\.[a-z0-9]+$/i, ""),
        caption: d.caption,
      }),
    });
    if (!resposta.ok) throw new Error(`${resposta.status} ${(await resposta.text()).slice(0, 200)}`);
  },
};
