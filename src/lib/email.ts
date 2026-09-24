import nodemailer from "nodemailer";

export function emailConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Envio por SMTP (qualquer provedor: Gmail com senha de app, Outlook, servidor da empresa...).
export async function enviarEmail(opcoes: {
  para: string[];
  assunto: string;
  texto: string;
  anexos?: { nome: string; conteudo: Buffer }[];
}) {
  const porta = Number(process.env.SMTP_PORT ?? 587);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: porta,
    secure: porta === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporte.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: opcoes.para,
    subject: opcoes.assunto,
    text: opcoes.texto,
    attachments: opcoes.anexos?.map((a) => ({ filename: a.nome, content: a.conteudo })),
  });
}
