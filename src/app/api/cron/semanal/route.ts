import { enviarEmail, emailConfigurado, emailDeRelatorio } from "@/lib/email";
import { ontem } from "@/lib/planilha";
import { htmlRelatorioSemanal, montarRelatorioSemanal } from "@/lib/relatorioSemanal";
import { createAdminClient } from "@/lib/supabase/admin";

// Relatório semanal das 4 unidades (agendado na Vercel toda quinta às 8h de Brasília, ver vercel.json). "Hoje" é a
// véspera (quarta-feira, o último dia completo), comparada com 7 dias antes. Vai só para o Bruno (pedido dele).
// Só roda com o segredo CRON_SECRET, que a Vercel manda no cabeçalho Authorization.
export const maxDuration = 120;

const DESTINATARIO = "brunogomesdasilva@gmail.com";

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`)
    return new Response("Não autorizado.", { status: 401 });
  const db = createAdminClient();
  if (!db) return new Response("Chave de serviço não configurada.", { status: 500 });
  if (!emailConfigurado()) return Response.json({ enviado: false, motivo: "e-mail de envio não configurado" });
  // O "E-mail para relatórios" do cadastro do Bruno, se preenchido.
  const { data: perfil } = await db.from("profiles").select("email, email_relatorios").eq("email", DESTINATARIO).maybeSingle();
  const para = perfil ? emailDeRelatorio(perfil) : DESTINATARIO;
  const referencia = ontem();
  const relatorio = await montarRelatorioSemanal(db, referencia);
  const dia = referencia.split("-").reverse().join("/");
  await enviarEmail({
    para: [para],
    assunto: `BFIT · Relatório semanal das unidades · ${dia}`,
    texto: `Relatório semanal das unidades com os dados de ${dia} e a comparação com 7 dias antes. Abra o e-mail em formato HTML para ver as tabelas.`,
    html: htmlRelatorioSemanal(relatorio),
  });
  return Response.json({ enviado: true, para, referencia });
}
