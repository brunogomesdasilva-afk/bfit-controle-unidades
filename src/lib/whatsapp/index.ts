import { meta } from "./providers/meta";
import { zapi } from "./providers/zapi";
import { ehGrupo, normalizarCelular, normalizarDestino } from "./telefone";
import type { DocumentoWhatsapp, GrupoWhatsapp, ProvedorWhatsapp } from "./tipos";

// Envio de relatórios por WhatsApp. O serviço é escolhido pela variável WHATSAPP_PROVIDER:
// "zapi" (padrão, Z-API com o número atual conectado por QR code) ou "meta" (WhatsApp Cloud API oficial).
// Só roda no servidor: as credenciais nunca vão ao navegador.

export { ehGrupo, normalizarCelular, normalizarDestino };
export type { DocumentoWhatsapp, GrupoWhatsapp };

const PROVEDORES: Record<string, ProvedorWhatsapp> = { meta, zapi };

export function provedorWhatsapp(): ProvedorWhatsapp {
  const nome = (process.env.WHATSAPP_PROVIDER || "zapi").trim().toLowerCase();
  const provedor = PROVEDORES[nome];
  if (!provedor) throw new Error(`WHATSAPP_PROVIDER inválido: "${nome}" (use meta ou zapi).`);
  return provedor;
}

export function whatsappConfigurado(): boolean {
  try {
    return provedorWhatsapp().configurado();
  } catch {
    return false;
  }
}

// Um documento para um celular ou grupo. Lança erro se falhar.
export async function sendDocument(documento: DocumentoWhatsapp) {
  const to = normalizarDestino(documento.to);
  if (!to) throw new Error(`celular ou grupo inválido: "${documento.to}"`);
  await provedorWhatsapp().sendDocument({ ...documento, to });
}

// Grupos de que o número conectado participa (para descobrir o ID de um grupo).
export async function listarGrupos(): Promise<GrupoWhatsapp[]> {
  const provedor = provedorWhatsapp();
  if (!provedor.listarGrupos) throw new Error(`${provedor.nome} não envia para grupos.`);
  return provedor.listarGrupos();
}

// Contra o WhatsApp tratar como spam: entre uma mensagem e a seguinte, uma pausa de alguns segundos (variável, como
// uma pessoa faria). WHATSAPP_PAUSA_SEGUNDOS muda a pausa mínima (padrão 4; 0 desliga).
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
function pausaEntreMensagens() {
  const minimo = Number(process.env.WHATSAPP_PAUSA_SEGUNDOS ?? 4);
  return minimo > 0 ? esperar((minimo + Math.random() * 4) * 1000) : Promise.resolve();
}

// Envia o PDF com uma legenda para cada celular (e para os grupos, se houver). Não lança erro: devolve os enviados,
// as falhas e quantos ficaram sem celular cadastrado (esses são pulados).
export async function enviarWhatsapp(opcoes: {
  para: (string | null | undefined)[];
  grupos?: string[];
  legenda: string;
  pdf: { nome: string; conteudo: Uint8Array };
}) {
  const enviados: string[] = [];
  const falhas: string[] = [];
  const semCelular = opcoes.para.filter((p) => !normalizarCelular(p)).length;
  if (!whatsappConfigurado()) {
    console.info(`[whatsapp] não configurado no servidor: nada enviado (${opcoes.legenda}).`);
    return { enviados, falhas, semCelular };
  }
  if (semCelular) console.info(`[whatsapp] ${semCelular} destinatário(s) sem WhatsApp cadastrado: pulados (${opcoes.legenda}).`);
  const celulares = [
    ...new Set([
      ...(opcoes.grupos ?? []).filter(ehGrupo),
      ...opcoes.para.map(normalizarCelular).filter((c): c is string => Boolean(c)),
    ]),
  ];
  for (const [i, celular] of celulares.entries()) {
    if (i > 0) await pausaEntreMensagens();
    try {
      await sendDocument({ to: celular, fileBuffer: opcoes.pdf.conteudo, fileName: opcoes.pdf.nome, caption: opcoes.legenda });
      enviados.push(celular);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : "erro";
      console.error(`[whatsapp] falha ao enviar para ${celular} (${opcoes.legenda}): ${motivo}`);
      falhas.push(`WhatsApp ${celular}: ${motivo}`);
    }
  }
  return { enviados, falhas, semCelular };
}
