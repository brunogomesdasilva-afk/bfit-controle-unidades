import { agoraEmBrasilia, executarRegra, regraValeNoDia, type RegraEnvio } from "@/lib/envios";
import { createAdminClient } from "@/lib/supabase/admin";

// Envios automáticos (agendado na Vercel de hora em hora, ver vercel.json): manda as regras ativas da hora atual de
// Brasília (tela Administrador > Envios automáticos), cada uma no máximo uma vez por dia.
// Só roda com o segredo CRON_SECRET, que a Vercel manda no cabeçalho Authorization.
export const maxDuration = 300;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`)
    return new Response("Não autorizado.", { status: 401 });
  const db = createAdminClient();
  if (!db) return new Response("Chave de serviço não configurada.", { status: 500 });

  const { hora, dia } = agoraEmBrasilia();
  const { data: regras } = await db.from("regras_envio").select("*").eq("ativo", true).eq("hora", hora).order("criado_em");
  const { data: feriados } = await db.from("feriados").select("data").is("academia_id", null);
  const datasFeriado = new Set((feriados ?? []).map((f) => f.data as string));

  const resultados: { regra: string; resultado: string }[] = [];
  for (const regra of (regras ?? []) as RegraEnvio[]) {
    if (!regraValeNoDia(regra, dia, datasFeriado)) continue;
    // Marca o dia antes de enviar: se o agendador rodar duas vezes na mesma hora, a segunda não repete o envio.
    const { data: marcada } = await db
      .from("regras_envio")
      .update({ ultimo_envio: dia })
      .eq("id", regra.id)
      .or(`ultimo_envio.is.null,ultimo_envio.lt.${dia}`)
      .select("id");
    if (!marcada?.length) continue;
    const r = await executarRegra(db, regra);
    await db.from("regras_envio").update({ ultimo_resultado: `${dia} ${String(hora).padStart(2, "0")}h: ${r.resultado}` }).eq("id", regra.id);
    resultados.push({ regra: regra.nome, resultado: r.resultado });
  }
  return Response.json({ dia, hora, resultados });
}
