import { gerarEscalaDoMes } from "@/lib/escalaUnidade";
import { hoje } from "@/lib/planilha";
import { createAdminClient } from "@/lib/supabase/admin";

// Geração automática da escala (agendada na Vercel todo dia, ver vercel.json). Só gera onde não há escala:
// - mês atual sem nenhum turno gravado (de hoje em diante);
// - a partir do dia 20, o mês seguinte sem nenhum turno gravado.
// A escala que o gerente já gerou (com as folgas pedidas) nunca é refeita aqui. Só roda com o CRON_SECRET.
export const maxDuration = 300;

const proximoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
};

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) return new Response("Não autorizado.", { status: 401 });
  const db = createAdminClient();
  if (!db) return new Response("Chave de serviço não configurada.", { status: 500 });

  const dataHoje = hoje();
  const meses = [dataHoje.slice(0, 7), ...(Number(dataHoje.slice(8, 10)) >= 20 ? [proximoMes(dataHoje.slice(0, 7))] : [])];
  const { data: academias } = await db.from("academias").select("id, nome");
  const resultado: { academia: string; mes: string; ok?: string; erro?: string; vazios: number }[] = [];
  for (const a of academias ?? []) {
    for (const mes of meses) {
      const [ano, m] = mes.split("-").map(Number);
      const fim = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
      const inicio = mes === dataHoje.slice(0, 7) ? dataHoje : `${mes}-01`;
      const { count } = await db.from("escala").select("id", { count: "exact", head: true }).eq("academia_id", a.id).gte("data", inicio).lte("data", fim);
      if (count) continue;
      const r = await gerarEscalaDoMes(db, a.id, mes);
      resultado.push({ academia: a.nome, mes, ok: r.ok, erro: r.erro, vazios: r.avisos?.length ?? 0 });
    }
  }
  return Response.json({ geradas: resultado });
}
