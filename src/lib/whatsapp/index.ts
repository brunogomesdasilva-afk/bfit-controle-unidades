import { meta } from "./providers/meta";
import { zapi } from "./providers/zapi";
import { normalizarCelular } from "./telefone";
import type { DocumentoWhatsapp, ProvedorWhatsapp } from "./tipos";

// Envio de relatórios por WhatsApp. O serviço é escolhido pela variável WHATSAPP_PROVIDER:
// "meta" (padrão, WhatsApp Cloud API oficial) ou "zapi" (Z-API). Só roda no servidor: as credenciais nunca vão ao navegador.

export { normalizarCelular };
export type { DocumentoWhatsapp };

const PROVEDORES: Record<string, ProvedorWhatsapp> = { meta, zapi };

export function provedorWhatsapp(): ProvedorWhatsapp {
  const nome = (process.env.WHATSAPP_PROVIDER || "meta").trim().toLowerCase();
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

// Um documento para um celular. Lança erro se falhar.
export async function sendDocument(documento: DocumentoWhatsapp) {
  const to = normalizarCelular(documento.to);
  if (!to) throw new Error(`celular inválido: "${documento.to}"`);
  await provedorWhatsapp().sendDocument({ ...documento, to });
}

// Envia o PDF com uma legenda para cada celular. Não lança erro: devolve os enviados, as falhas e quantos ficaram sem
// celular cadastrado (esses são pulados).
export async function enviarWhatsapp(opcoes: {
  para: (string | null | undefined)[];
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
  const celulares = [...new Set(opcoes.para.map(normalizarCelular).filter((c): c is string => Boolean(c)))];
  for (const celular of celulares) {
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
