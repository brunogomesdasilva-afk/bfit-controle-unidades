import { avisoNaoConfigurado, enviarRelatorio, envioConfigurado } from "@/lib/notificar";
import { ontem } from "@/lib/planilha";
import { htmlRelatorioSemanal, montarRelatorioSemanal, pdfRelatorioSemanal } from "@/lib/relatorioSemanal";
import { createAdminClient } from "@/lib/supabase/admin";

// Relatório semanal das 4 unidades (agendado na Vercel toda quinta às 8h de Brasília, ver vercel.json). "Hoje" é a
// véspera (quarta-feira, o último dia completo), comparada com 7 dias antes. Vai só para o Bruno (pedido dele), pelo
// canal de NOTIFY_CHANNEL: PDF no WhatsApp do cadastro dele, ou e-mail (HTML + PDF).
// Só roda com o segredo CRON_SECRET, que a Vercel manda no cabeçalho Authorization.
export const maxDuration = 120;

const DESTINATARIO = "brunogomesdasilva@gmail.com";

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`)
    return new Response("Não autorizado.", { status: 401 });
  const db = createAdminClient();
  if (!db) return new Response("Chave de serviço não configurada.", { status: 500 });
  if (!envioConfigurado()) return Response.json({ enviado: false, motivo: avisoNaoConfigurado() });
  // O cadastro do Bruno: WhatsApp e "E-mail para relatórios", se preenchidos.
  const { data: perfil } = await db.from("profiles").select("email, email_relatorios, whatsapp").eq("email", DESTINATARIO).maybeSingle();
  const referencia = ontem();
  const relatorio = await montarRelatorioSemanal(db, referencia);
  const { pdf, arquivo } = await pdfRelatorioSemanal(relatorio);
  const dia = referencia.split("-").reverse().join("/");
  const r = await enviarRelatorio({
    para: [perfil ?? { email: DESTINATARIO }],
    assunto: `BFIT · Relatório semanal das unidades · ${dia}`,
    texto: `Relatório semanal das unidades com os dados de ${dia} e a comparação com 7 dias antes (também em PDF, em anexo). Abra o e-mail em formato HTML para ver as tabelas.`,
    html: htmlRelatorioSemanal(relatorio),
    pdf: { nome: arquivo, conteudo: pdf },
  });
  return Response.json({ enviado: r.enviados.length > 0, canal: r.canal, para: r.enviados, falhas: r.falhas, semContato: r.semContato, referencia });
}
