// Dias úteis do financeiro: vencimento que cai em sábado, domingo ou feriado vai para o próximo dia útil.

const somar = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function ehDiaUtil(data: string, feriados: Set<string>) {
  const dia = new Date(`${data}T12:00:00Z`).getUTCDay();
  return dia !== 0 && dia !== 6 && !feriados.has(data);
}

export function proximoDiaUtil(data: string, feriados: Set<string>) {
  let d = data;
  for (let i = 0; i < 15 && !ehDiaUtil(d, feriados); i++) d = somar(d, 1);
  return d;
}

// Feriados que valem para uma academia: os nacionais e os da cidade dela.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function feriadosDaAcademia(supabase: any, academiaId: string | null) {
  const { data } = await supabase.from("feriados").select("data, academia_id");
  return new Set(((data ?? []) as { data: string; academia_id: string | null }[]).filter((f) => !f.academia_id || f.academia_id === academiaId).map((f) => f.data));
}
