import { hoje } from "@/lib/planilha";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Contagens (sala, coletivas e lutas) que ficaram sem preencher. A contagem é por horário, e cada unidade
// tem sua grade: os horários de cada dia da semana saem do que a própria unidade lançou nas 8 semanas
// anteriores ao fim do período (horário que aparece em pelo menos metade das semanas daquele dia da semana).
// Feriado com a academia fechada não cobra nada; nos outros feriados a sala segue a grade de domingo e
// coletivas/lutas não cobram. Hoje não entra (o dia ainda está em andamento).

// Primeiro dia cobrado (início do uso do sistema nas unidades).
export const COBRAR_DESDE = "2026-09-01";
const SEMANAS_DA_GRADE = 8;

export const CONTAGENS = {
  contagem_sala: "Sala",
  contagem_coletivas: "Coletivas",
  contagem_lutas: "Lutas",
} as const;
type Contagem = keyof typeof CONTAGENS;

export type Falta = { academiaId: string; data: string; contagem: Contagem; horarios: string[] };

const somarDias = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const semanaDe = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

async function lancados(supabase: Supabase, tabela: Contagem, academiaIds: string[], desde: string, ate: string) {
  const linhas: { academia_id: string; data: string; horario: string }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data } = await supabase
      .from(tabela)
      .select("academia_id, data, horario")
      .in("academia_id", academiaIds)
      .gte("data", desde)
      .lte("data", ate)
      .order("id")
      .range(de, de + 999);
    linhas.push(...((data ?? []) as typeof linhas));
    if (!data || data.length < 1000) break;
  }
  return linhas;
}

// Período padrão (aviso do login): de COBRAR_DESDE até ontem. O fechamento do mês passa o mês escolhido.
export async function contagensFaltando(
  supabase: Supabase,
  academiaIds: string[],
  periodo: { inicio: string; fim: string } = { inicio: COBRAR_DESDE, fim: somarDias(hoje(), -1) }
): Promise<Falta[]> {
  const inicio = periodo.inicio;
  const ontem = periodo.fim < somarDias(hoje(), -1) ? periodo.fim : somarDias(hoje(), -1);
  if (academiaIds.length === 0 || ontem < inicio) return [];
  const inicioGrade = somarDias(ontem, 1 - 7 * SEMANAS_DA_GRADE);
  const desde = inicioGrade < inicio ? inicioGrade : inicio;

  const { data: feriados } = await supabase.from("feriados").select("academia_id, data, fechada").gte("data", desde).lte("data", ontem);
  const feriadoDe = (academiaId: string, d: string) =>
    (feriados ?? []).find((f) => f.data === d && (f.academia_id === null || f.academia_id === academiaId));

  const faltas: Falta[] = [];
  for (const tabela of Object.keys(CONTAGENS) as Contagem[]) {
    const linhas = await lancados(supabase, tabela, academiaIds, desde, ontem);
    for (const academiaId of academiaIds) {
      // Horários lançados em cada data desta unidade.
      const porData = new Map<string, Set<string>>();
      for (const l of linhas)
        if (l.academia_id === academiaId) {
          if (!porData.has(l.data)) porData.set(l.data, new Set());
          porData.get(l.data)!.add(l.horario.slice(0, 5));
        }

      // Grade por dia da semana, a partir das 8 semanas anteriores a hoje (dias normais, sem feriado).
      const vezes = new Map<string, number>();
      const semanas = [0, 0, 0, 0, 0, 0, 0];
      for (let d = inicioGrade; d <= ontem; d = somarDias(d, 1)) {
        if (feriadoDe(academiaId, d)) continue;
        const w = semanaDe(d);
        semanas[w]++;
        for (const h of porData.get(d) ?? []) vezes.set(`${w}|${h}`, (vezes.get(`${w}|${h}`) ?? 0) + 1);
      }
      const grade = [0, 1, 2, 3, 4, 5, 6].map((w) =>
        [...vezes.entries()]
          .filter(([k, n]) => k.startsWith(`${w}|`) && n >= semanas[w] / 2)
          .map(([k]) => k.slice(2))
          .sort()
      );

      for (let d = inicio; d <= ontem; d = somarDias(d, 1)) {
        const feriado = feriadoDe(academiaId, d);
        if (feriado?.fechada) continue;
        if (feriado && tabela !== "contagem_sala") continue;
        const esperados = grade[feriado ? 0 : semanaDe(d)];
        const feitos = porData.get(d) ?? new Set();
        const horarios = esperados.filter((h) => !feitos.has(h));
        if (horarios.length) faltas.push({ academiaId, data: d, contagem: tabela, horarios });
      }
    }
  }
  return faltas.sort((a, b) => a.data.localeCompare(b.data));
}

// Dias sem nenhum lançamento no Diário (vendas) no período, até ontem. Feriado com a academia fechada não conta.
export async function diasSemDiario(supabase: Supabase, academiaId: string, inicio: string, fim: string) {
  const ontem = fim < somarDias(hoje(), -1) ? fim : somarDias(hoje(), -1);
  if (ontem < inicio) return [];
  const [{ data: lancados }, { data: fechados }] = await Promise.all([
    supabase.from("controle_diario").select("data").eq("academia_id", academiaId).gte("data", inicio).lte("data", ontem),
    supabase.from("feriados").select("data, academia_id").eq("fechada", true).gte("data", inicio).lte("data", ontem),
  ]);
  const feitos = new Set((lancados ?? []).map((l) => l.data as string));
  const fechado = new Set(
    (fechados ?? []).filter((f) => f.academia_id === null || f.academia_id === academiaId).map((f) => f.data as string)
  );
  const faltam: string[] = [];
  for (let d = inicio; d <= ontem; d = somarDias(d, 1)) if (!feitos.has(d) && !fechado.has(d)) faltam.push(d);
  return faltam;
}
