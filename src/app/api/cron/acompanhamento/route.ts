import { enviarAcompanhamento } from "@/lib/acompanhamento";
import { ehDiaUtil } from "@/lib/diasUteis";
import { hoje, ontem } from "@/lib/planilha";
import { createAdminClient } from "@/lib/supabase/admin";

// Envio diário automático do acompanhamento (agendado na Vercel, ver vercel.json). Só roda com o segredo
// CRON_SECRET, que a Vercel manda no cabeçalho Authorization. Referência: o dia anterior.
// Só em dias úteis (pedido do Bruno): sábado, domingo e feriado nacional não enviam; na segunda, o PDF é do domingo
// (com o acumulado do mês até ele).
export const maxDuration = 300;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`)
    return new Response("Não autorizado.", { status: 401 });
  const db = createAdminClient();
  if (!db) return new Response("Chave de serviço não configurada.", { status: 500 });
  const { data: feriados } = await db.from("feriados").select("data").is("academia_id", null);
  if (!ehDiaUtil(hoje(), new Set((feriados ?? []).map((f) => f.data as string))))
    return Response.json({ enviado: false, motivo: "Hoje não é dia útil: o acompanhamento não é enviado." });
  // Período de teste (pedido do Bruno): o envio automático vai só para os administradores até ele liberar
  // para os gerentes. Para liberar, troque para false.
  const SO_ADMINISTRADORES = true;
  const resultado = await enviarAcompanhamento(db, { referencia: ontem(), soAdministradores: SO_ADMINISTRADORES });
  return Response.json(resultado);
}
