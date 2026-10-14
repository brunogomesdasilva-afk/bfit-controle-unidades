import { emailConfigurado, emailDeRelatorio, enviarEmail } from "@/lib/email";
import { enviarWhatsapp, normalizarCelular, whatsappConfigurado } from "@/lib/whatsapp";

// Envio dos relatórios (PDF) para os usuários, pelo canal escolhido na variável NOTIFY_CHANNEL:
//   "whatsapp" (padrão): vai para o celular do cadastro (profiles.whatsapp); quem não tem é pulado e fica no log.
//   "email": o envio antigo por SMTP (ver email.ts), guardado para poder voltar atrás.
// Não lança erro: cada destinatário que falha entra em "falhas" e os demais seguem.

export type Canal = "whatsapp" | "email";

export type Destinatario = { email?: string | null; email_relatorios?: string | null; whatsapp?: string | null };

export const canalDeEnvio = (): Canal => ((process.env.NOTIFY_CHANNEL ?? "").trim().toLowerCase() === "email" ? "email" : "whatsapp");

export const nomeDoCanal = (canal: Canal = canalDeEnvio()) => (canal === "email" ? "e-mail" : "WhatsApp");

export const envioConfigurado = (canal: Canal = canalDeEnvio()) => (canal === "email" ? emailConfigurado() : whatsappConfigurado());

export const avisoNaoConfigurado = () => `O ${nomeDoCanal()} de envio ainda não foi configurado no sistema. Fale com o administrador.`;

// Endereços (e-mails ou celulares normalizados) dos destinatários no canal atual, sem repetidos e sem vazios.
export function contatos(para: Destinatario[], canal: Canal = canalDeEnvio()): string[] {
  const lista = para.map((p) => (canal === "email" ? emailDeRelatorio({ email: p.email ?? null, email_relatorios: p.email_relatorios }) : normalizarCelular(p.whatsapp)));
  return [...new Set(lista.filter((c): c is string => Boolean(c)))];
}

export type ResumoEnvio = { canal: Canal; enviados: string[]; falhas: string[]; semContato: number };

export async function enviarRelatorio(opcoes: {
  para: Destinatario[];
  grupos?: string[]; // WhatsApp: IDs de grupos que também recebem
  canal?: Canal; // padrão: NOTIFY_CHANNEL (as regras de envio automático escolhem o seu)
  assunto: string; // também é a legenda do PDF no WhatsApp
  texto: string; // corpo do e-mail
  html?: string; // corpo formatado do e-mail (opcional)
  pdf: { nome: string; conteudo: Uint8Array };
}): Promise<ResumoEnvio> {
  const canal = opcoes.canal ?? canalDeEnvio();
  if (canal === "whatsapp") {
    const r = await enviarWhatsapp({ para: opcoes.para.map((p) => p.whatsapp), grupos: opcoes.grupos, legenda: opcoes.assunto, pdf: opcoes.pdf });
    return { canal, enviados: r.enviados, falhas: r.falhas, semContato: r.semCelular };
  }

  const emails = contatos(opcoes.para, "email");
  const semContato = opcoes.para.length - emails.length;
  if (!emails.length) return { canal, enviados: [], falhas: [], semContato };
  if (!emailConfigurado()) return { canal, enviados: [], falhas: ["e-mail de envio não configurado"], semContato };
  try {
    await enviarEmail({
      para: emails,
      assunto: opcoes.assunto,
      texto: opcoes.texto,
      html: opcoes.html,
      anexos: [{ nome: opcoes.pdf.nome, conteudo: Buffer.from(opcoes.pdf.conteudo) }],
    });
    return { canal, enviados: emails, falhas: [], semContato };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "erro";
    console.error(`[email] falha ao enviar "${opcoes.assunto}": ${motivo}`);
    return { canal, enviados: [], falhas: [`e-mail: ${motivo}`], semContato };
  }
}
