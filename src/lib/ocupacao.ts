import type { SupabaseClient } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>> | SupabaseClient;

// Ocupação das aulas: de todo mundo que estava na academia no horário da aula (musculação + cardio da contagem
// de sala daquela hora + lutas + coletivas daquela hora), quantos % estavam na aula.
// Ex.: 18h com 6 na musculação, 4 no cardio, 3 em lutas e 7 em coletivas → coletivas 35%, lutas 15%.
// A contagem de sala é por hora: a aula das 18:30 usa a contagem das 18h. Aula sem contagem de sala naquela hora
// não entra na média. O % do dia/mês é a média das aulas; o do professor é a média das aulas que ele deu no
// período (manhã até 12h, tarde até 18h, noite a partir das 18h).

export type Periodo = "manha" | "tarde" | "noite";
export const PERIODOS: Record<Periodo, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };
const periodoDe = (h: string): Periodo => (h < "12:00" ? "manha" : h < "18:00" ? "tarde" : "noite");

type Aula = { academia_id: string; data: string; horario: string; quantidade: number; professor: string | null; professor_substituto: string | null };
type Sala = { academia_id: string; data: string; horario: string; musculacao: number; cardio: number };

export type OcupacaoProfessor = { tipo: "coletivas" | "lutas"; professor: string; periodo: Periodo; aulas: number; media: number };

type Paginavel = { range: (de: number, ate: number) => PromiseLike<{ data: unknown }> };

// Lê todas as linhas de mil em mil (o banco devolve no máximo mil por vez).
async function todas<T>(consulta: () => Paginavel): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data } = await consulta().range(de, de + 999);
    const linhas = (data ?? []) as T[];
    out.push(...linhas);
    if (linhas.length < 1000) return out;
  }
}

const media = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

export async function ocupacao(db: Supabase, unidade: string | null, inicio: string, fim: string, dia: string) {
  const ler = (tabela: string, colunas: string) => () => {
    const q = db.from(tabela).select(colunas).gte("data", inicio).lte("data", fim).order("data").order("horario");
    return unidade ? q.eq("academia_id", unidade) : q;
  };
  const aulaCols = "academia_id, data, horario, quantidade, professor, professor_substituto";
  const [sala, coletivas, lutas] = await Promise.all([
    todas<Sala>(ler("contagem_sala", "academia_id, data, horario, musculacao, cardio")),
    todas<Aula>(ler("contagem_coletivas", aulaCols)),
    todas<Aula>(ler("contagem_lutas", aulaCols)),
  ]);

  // Pessoas na sala por academia, dia e hora.
  const salaHora = new Map<string, number>();
  for (const s of sala) salaHora.set(`${s.academia_id}|${s.data}|${s.horario.slice(0, 2)}`, s.musculacao + s.cardio);
  // Alunos em aulas por academia, dia e horário exato (e por hora, para a outra modalidade).
  const somaPor = (aulas: Aula[], chave: (a: Aula) => string) => {
    const m = new Map<string, number>();
    for (const a of aulas) m.set(chave(a), (m.get(chave(a)) ?? 0) + a.quantidade);
    return m;
  };
  const lutasHora = somaPor(lutas, (a) => `${a.academia_id}|${a.data}|${a.horario.slice(0, 2)}`);
  const coletivasHorario = somaPor(coletivas, (a) => `${a.academia_id}|${a.data}|${a.horario.slice(0, 5)}`);

  const calcular = (tipo: "coletivas" | "lutas", aulas: Aula[]) => {
    const porDia: number[] = [];
    const porMes: number[] = [];
    const porProfessor = new Map<string, { professor: string; periodo: Periodo; valores: number[] }>();
    for (const a of aulas) {
      const hora = `${a.academia_id}|${a.data}|${a.horario.slice(0, 2)}`;
      const naSala = salaHora.get(hora);
      if (naSala === undefined) continue;
      // Outra modalidade no mesmo momento: lutas da hora (para coletivas) ou coletivas do mesmo horário (para lutas).
      const outra = tipo === "coletivas" ? (lutasHora.get(hora) ?? 0) : (coletivasHorario.get(`${a.academia_id}|${a.data}|${a.horario.slice(0, 5)}`) ?? 0);
      const total = naSala + outra + a.quantidade;
      if (!total) continue;
      const pct = a.quantidade / total;
      porMes.push(pct);
      if (a.data === dia) porDia.push(pct);
      const professor = a.professor_substituto || a.professor || "(não informado)";
      const periodo = periodoDe(a.horario.slice(0, 5));
      const k = `${professor}|${periodo}`;
      if (!porProfessor.has(k)) porProfessor.set(k, { professor, periodo, valores: [] });
      porProfessor.get(k)!.valores.push(pct);
    }
    return {
      dia: media(porDia),
      mes: media(porMes),
      aulasMes: porMes.length,
      professores: [...porProfessor.values()].map(
        (p): OcupacaoProfessor => ({ tipo, professor: p.professor, periodo: p.periodo, aulas: p.valores.length, media: media(p.valores)! })
      ),
    };
  };

  return { coletivas: calcular("coletivas", coletivas), lutas: calcular("lutas", lutas) };
}

export type Ocupacao = Awaited<ReturnType<typeof ocupacao>>;
