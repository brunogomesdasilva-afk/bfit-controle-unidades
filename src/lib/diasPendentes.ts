import type { createClient } from "@/lib/supabase/server";
import { hoje } from "@/lib/planilha";

// Dias sem lançamento do controle diário, do dia seguinte ao último lançado até hoje (ex.: na segunda,
// sábado, domingo e segunda). Feriados com a academia fechada não entram. No máximo os últimos 14 dias.
const somarDia = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const LIMITE = 14;

export async function diasPendentesDoDiario(supabase: Awaited<ReturnType<typeof createClient>>, academiaId: string) {
  const dataHoje = hoje();
  const { data: ultimo } = await supabase
    .from("controle_diario")
    .select("data")
    .eq("academia_id", academiaId)
    .lte("data", dataHoje)
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();
  const inicio = ultimo ? somarDia(ultimo.data as string, 1) : dataHoje;
  const primeiro = inicio < somarDia(dataHoje, -(LIMITE - 1)) ? somarDia(dataHoje, -(LIMITE - 1)) : inicio;
  if (primeiro > dataHoje) return [];
  const { data: fechados } = await supabase.from("feriados").select("data, academia_id").eq("fechada", true).gte("data", primeiro).lte("data", dataHoje);
  const fechado = new Set((fechados ?? []).filter((f) => f.academia_id === null || f.academia_id === academiaId).map((f) => f.data as string));
  const dias: string[] = [];
  for (let d = primeiro; d <= dataHoje; d = somarDia(d, 1)) if (!fechado.has(d) && !["12-24", "12-25", "12-31", "01-01"].includes(d.slice(5))) dias.push(d);
  return dias;
}
