import { hoje, intervaloDoMes } from "@/lib/planilha";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Fechamento de coletivas e lutas: horas que cada professor deveria dar no mês (pela grade de aulas) × horas
// que deu (pelas contagens). Cada ocorrência de uma aula da grade no mês é comparada com a contagem do dia:
//   - quem deu = substituto (se houver) ou o professor da contagem;
//   - se quem deu é o professor da grade: hora dada; se foi outro: "coberto por outro" para o titular e
//     "cobriu" para quem deu; se não há contagem: "sem contagem" (aula não lançada ou não dada).
// Aulas lançadas fora da grade contam como "extra" para quem deu. Feriados não têm aula prevista.

export type Tipo = "coletivas" | "lutas";
export const TIPOS: Record<Tipo, string> = { coletivas: "Coletivas", lutas: "Lutas" };
export const DURACAO_PADRAO: Record<Tipo, number> = { coletivas: 30, lutas: 60 };
export const DIAS_SEMANA = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]; // 1..7

export type AulaDaGrade = {
  id: string;
  tipo: Tipo;
  dia_semana: number;
  horario: string;
  modalidade: string;
  professor: string | null;
  duracao_min: number;
};

export type LinhaProfessor = {
  professor: string;
  tipo: Tipo;
  previstas: number; // horas
  dadas: number; // aulas da grade dadas por ele
  cobertoPorOutro: number; // aulas dele que outro deu
  semContagem: number; // aulas dele sem contagem lançada
  cobriu: number; // aulas de outros que ele deu
  extras: number; // aulas fora da grade
  aPagar: number; // dadas + cobriu + extras
};

export type Cobertura = {
  data: string;
  horario: string;
  tipo: Tipo;
  modalidade: string;
  titular: string;
  quemDeu: string;
  horas: number;
};

export type SemContagem = { data: string; horario: string; tipo: Tipo; modalidade: string; titular: string; horas: number };

const somarDias = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
// Dia da semana 1 (segunda) ... 7 (domingo)
export const diaIso = (d: string) => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const chave = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const hh = (h: string) => h.slice(0, 5);

type Contagem = {
  data: string;
  horario: string;
  modalidade: string | null;
  professor: string | null;
  professor_substituto: string | null;
};

export async function carregarGrade(supabase: Supabase, academiaId: string) {
  const { data } = await supabase
    .from("grade_aulas")
    .select("id, tipo, dia_semana, horario, modalidade, professor, duracao_min")
    .eq("academia_id", academiaId)
    .order("tipo")
    .order("dia_semana")
    .order("horario");
  return (data ?? []) as AulaDaGrade[];
}

export async function fechamentoColetivas(supabase: Supabase, academiaId: string, mes: string, gradePronta?: AulaDaGrade[]) {
  const { inicio, fim: fimMes } = intervaloDoMes(mes);
  // No mês atual, as aulas previstas vão só até ontem (o que ainda vai acontecer não entra).
  const ontem = somarDias(hoje(), -1);
  const fim = fimMes < ontem ? fimMes : ontem;

  const [grade, { data: coletivas }, { data: lutas }, { data: feriados }] = await Promise.all([
    gradePronta ?? carregarGrade(supabase, academiaId),
    supabase.from("contagem_coletivas").select("data, horario, modalidade, professor, professor_substituto").eq("academia_id", academiaId).gte("data", inicio).lte("data", fimMes),
    supabase.from("contagem_lutas").select("data, horario, modalidade, professor, professor_substituto").eq("academia_id", academiaId).gte("data", inicio).lte("data", fimMes),
    supabase.from("feriados").select("data, academia_id").gte("data", inicio).lte("data", fimMes),
  ]);
  const feriado = new Set((feriados ?? []).filter((f) => !f.academia_id || f.academia_id === academiaId).map((f) => f.data as string));

  const linhas = new Map<string, LinhaProfessor>();
  const doProfessor = (professor: string, tipo: Tipo) => {
    const k = `${tipo}|${professor}`;
    if (!linhas.has(k)) linhas.set(k, { professor, tipo, previstas: 0, dadas: 0, cobertoPorOutro: 0, semContagem: 0, cobriu: 0, extras: 0, aPagar: 0 });
    return linhas.get(k)!;
  };
  const coberturas: Cobertura[] = [];
  const semContagem: SemContagem[] = [];

  for (const [tipo, contagens] of [["coletivas", coletivas ?? []], ["lutas", lutas ?? []]] as [Tipo, Contagem[]][]) {
    const daGrade = grade.filter((g) => g.tipo === tipo);
    const usadas = new Set<Contagem>();
    // Coletivas: uma aula por horário, então basta dia e horário (a modalidade às vezes vem escrita diferente,
    // ex.: "FIT DANCE / STEP"). Lutas: mesma modalidade e, se não achar, qualquer aula livre no horário.
    const contagemDe = (d: string, g: AulaDaGrade) => {
      const livres = contagens.filter((c) => !usadas.has(c) && c.data === d && hh(c.horario) === hh(g.horario));
      return livres.find((c) => chave(c.modalidade) === chave(g.modalidade)) ?? livres[0];
    };

    // Aulas previstas pela grade, dia a dia.
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
      if (feriado.has(d)) continue;
      for (const g of daGrade.filter((x) => x.dia_semana === diaIso(d))) {
        const horas = g.duracao_min / 60;
        const titular = g.professor ?? "(sem professor na grade)";
        const t = doProfessor(titular, tipo);
        t.previstas += horas;
        const c = contagemDe(d, g);
        if (!c) {
          t.semContagem += horas;
          semContagem.push({ data: d, horario: hh(g.horario), tipo, modalidade: g.modalidade, titular, horas });
          continue;
        }
        usadas.add(c);
        const quemDeu = c.professor_substituto || c.professor || "(não informado)";
        if (chave(quemDeu) === chave(titular)) t.dadas += horas;
        else {
          t.cobertoPorOutro += horas;
          doProfessor(quemDeu, tipo).cobriu += horas;
          coberturas.push({ data: d, horario: hh(g.horario), tipo, modalidade: g.modalidade, titular, quemDeu, horas });
        }
      }
    }
    // Aulas lançadas que não estão na grade (ou em feriado): extra para quem deu.
    for (const c of contagens) {
      if (usadas.has(c) || c.data > fim) continue;
      const quemDeu = c.professor_substituto || c.professor || "(não informado)";
      doProfessor(quemDeu, tipo).extras += DURACAO_PADRAO[tipo] / 60;
    }
  }

  for (const l of linhas.values()) l.aPagar = l.dadas + l.cobriu + l.extras;
  const professores = [...linhas.values()].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.professor.localeCompare(b.professor, "pt-BR"));
  return { grade, professores, coberturas, semContagem, periodo: { inicio, fim } };
}

// Monta a grade a partir das contagens das últimas 8 semanas: aula (dia da semana + horário + modalidade)
// que aparece em pelo menos metade das semanas; o professor é o que mais deu aquela aula.
export async function gradePelasContagens(supabase: Supabase, academiaId: string) {
  const fim = somarDias(hoje(), -1);
  const inicio = somarDias(fim, -55);
  const aulas: Omit<AulaDaGrade, "id">[] = [];
  for (const tipo of ["coletivas", "lutas"] as Tipo[]) {
    const { data } = await supabase
      .from(tipo === "coletivas" ? "contagem_coletivas" : "contagem_lutas")
      .select("data, horario, modalidade, professor, professor_substituto")
      .eq("academia_id", academiaId)
      .gte("data", inicio)
      .lte("data", fim);
    const semanas = new Map<number, Set<string>>(); // dia da semana -> datas com aula
    const vezes = new Map<string, { datas: Set<string>; professores: Map<string, number>; modalidades: Map<string, number>; horario: string; dia: number }>();
    for (const c of (data ?? []) as Contagem[]) {
      if (!c.modalidade) continue;
      const dia = diaIso(c.data);
      if (!semanas.has(dia)) semanas.set(dia, new Set());
      semanas.get(dia)!.add(c.data);
      // Coletivas: a aula é o horário do dia; lutas: horário + modalidade (pode haver duas no mesmo horário).
      const k = tipo === "coletivas" ? `${dia}|${hh(c.horario)}` : `${dia}|${hh(c.horario)}|${chave(c.modalidade)}`;
      if (!vezes.has(k)) vezes.set(k, { datas: new Set(), professores: new Map(), modalidades: new Map(), horario: hh(c.horario), dia });
      const v = vezes.get(k)!;
      v.datas.add(c.data);
      v.modalidades.set(c.modalidade, (v.modalidades.get(c.modalidade) ?? 0) + 1);
      if (c.professor && !c.professor_substituto) v.professores.set(c.professor, (v.professores.get(c.professor) ?? 0) + 1);
    }
    for (const v of vezes.values()) {
      if (v.datas.size < (semanas.get(v.dia)?.size ?? 0) / 2) continue;
      const maisFrequente = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      aulas.push({
        tipo,
        dia_semana: v.dia,
        horario: v.horario,
        modalidade: maisFrequente(v.modalidades)!,
        professor: maisFrequente(v.professores),
        duracao_min: DURACAO_PADRAO[tipo],
      });
    }
  }
  return aulas;
}
