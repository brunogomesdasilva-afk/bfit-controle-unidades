import type { DocumentoWhatsapp, GrupoWhatsapp, ProvedorWhatsapp } from "../tipos";

// Z-API (serviço não oficial, https://z-api.io): conecta um número já existente por QR code.
// Variáveis: ZAPI_INSTANCE_ID (ou ZAPI_INSTANCIA, nome antigo), ZAPI_TOKEN e ZAPI_CLIENT_TOKEN (token de segurança).
// Envia para celulares e para grupos de que o número conectado participa (o "to" é o ID do grupo).

const instancia = () => process.env.ZAPI_INSTANCE_ID || process.env.ZAPI_INSTANCIA;
const base = () => `https://api.z-api.io/instances/${instancia()}/token/${process.env.ZAPI_TOKEN}`;
const cabecalhos = () => ({
  "Content-Type": "application/json",
  ...(process.env.ZAPI_CLIENT_TOKEN ? { "Client-Token": process.env.ZAPI_CLIENT_TOKEN } : {}),
});

export const zapi: ProvedorWhatsapp = {
  nome: "Z-API",
  configurado: () => Boolean(instancia() && process.env.ZAPI_TOKEN),
  async sendDocument(d: DocumentoWhatsapp) {
    const extensao = (d.fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "pdf").toLowerCase();
    const documento = d.fileBuffer
      ? `data:application/${extensao};base64,${Buffer.from(d.fileBuffer).toString("base64")}`
      : d.fileUrl;
    if (!documento) throw new Error("arquivo não informado");
    const resposta = await fetch(`${base()}/send-document/${extensao}`, {
      method: "POST",
      headers: cabecalhos(),
      body: JSON.stringify({
        phone: d.to,
        document: documento,
        fileName: d.fileName.replace(/\.[a-z0-9]+$/i, ""),
        caption: d.caption,
      }),
    });
    if (!resposta.ok) throw new Error(`${resposta.status} ${(await resposta.text()).slice(0, 200)}`);
  },
  async listarGrupos() {
    const grupos: GrupoWhatsapp[] = [];
    for (let pagina = 1; pagina <= 20; pagina++) {
      const resposta = await fetch(`${base()}/groups?page=${pagina}&pageSize=100`, { headers: cabecalhos() });
      if (!resposta.ok) throw new Error(`${resposta.status} ${(await resposta.text()).slice(0, 200)}`);
      const lista = (await resposta.json()) as { phone?: string; name?: string }[];
      grupos.push(...lista.filter((g) => g.phone).map((g) => ({ id: g.phone!, nome: g.name ?? "(sem nome)" })));
      if (lista.length < 100) break;
    }
    return grupos;
  },
};
