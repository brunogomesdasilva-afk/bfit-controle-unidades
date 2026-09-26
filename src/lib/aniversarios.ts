import { DEPARTAMENTOS, type Funcionario } from "@/lib/database.types";
import { hoje, intervaloDoMes } from "@/lib/planilha";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Aniversariante = {
  academiaId: string;
  nome: string;
  departamento: string;
  // Dia do aniversário neste ano (aaaa-mm-dd) e a idade que a pessoa faz.
  dia: string;
  idade: number;
};

const DIAS_DA_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const semanaDe = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
export const diaDaSemana = (d: string) => DIAS_DA_SEMANA[semanaDe(d)];
export const formatarDia = (d: string) => d.split("-").reverse().join("/");

function somarDias(d: string, n: number) {
  const [a, m, dia] = d.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, dia + n)).toISOString().slice(0, 10);
}

export function somarMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

// Aniversário no ano pedido. Quem nasceu em 29/02 comemora em 28/02 nos anos que não são bissextos.
function aniversarioNoAno(nascimento: string, ano: number) {
  const md = nascimento.slice(5, 10);
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  return `${ano}-${md === "02-29" && !bissexto ? "02-28" : md}`;
}

function paraAniversariante(f: Funcionario, ano: number): Aniversariante {
  return {
    academiaId: f.academia_id,
    nome: f.nome,
    departamento: DEPARTAMENTOS[f.departamento] ?? f.departamento,
    dia: aniversarioNoAno(f.data_nascimento!, ano),
    idade: ano - Number(f.data_nascimento!.slice(0, 4)),
  };
}

async function funcionariosComNascimento(supabase: Supabase, academiaIds: string[]) {
  if (academiaIds.length === 0) return [];
  const { data } = await supabase
    .from("funcionarios")
    .select("*")
    .in("academia_id", academiaIds)
    .not("data_nascimento", "is", null)
    .order("nome");
  return (data ?? []) as Funcionario[];
}

// Aniversariantes de um mês (aaaa-mm), por dia.
export async function aniversariantesDoMes(supabase: Supabase, academiaIds: string[], mes: string) {
  const ano = Number(mes.slice(0, 4));
  const { inicio, fim } = intervaloDoMes(mes);
  return (await funcionariosComNascimento(supabase, academiaIds))
    .map((f) => paraAniversariante(f, ano))
    .filter((a) => a.dia >= inicio && a.dia <= fim)
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.nome.localeCompare(b.nome));
}

// Lembrete da tela: os aniversários de hoje e, se hoje é dia útil, também os dos dias sem expediente que
// vêm logo depois (fim de semana e feriados da unidade), para o gerente ver no último dia útil antes deles.
export async function lembretesDeAniversario(supabase: Supabase, academiaIds: string[]) {
  const dataHoje = hoje();
  const ate = somarDias(dataHoje, 12);
  const { data: feriados } = await supabase.from("feriados").select("academia_id, data").gte("data", dataHoje).lte("data", ate);
  const ehFeriado = (academiaId: string, d: string) =>
    (feriados ?? []).some((f) => f.data === d && (f.academia_id === null || f.academia_id === academiaId));
  const diaUtil = (academiaId: string, d: string) => semanaDe(d) >= 1 && semanaDe(d) <= 5 && !ehFeriado(academiaId, d);

  // Dias cobertos pelo lembrete de hoje em cada unidade.
  const diasPorAcademia = new Map<string, Set<string>>();
  for (const id of academiaIds) {
    const dias = new Set([dataHoje]);
    if (diaUtil(id, dataHoje))
      for (let d = somarDias(dataHoje, 1); d <= ate && !diaUtil(id, d); d = somarDias(d, 1)) dias.add(d);
    diasPorAcademia.set(id, dias);
  }

  const lembretes: Aniversariante[] = [];
  for (const f of await funcionariosComNascimento(supabase, academiaIds)) {
    for (const d of diasPorAcademia.get(f.academia_id) ?? []) {
      const a = paraAniversariante(f, Number(d.slice(0, 4)));
      if (a.dia === d) lembretes.push(a);
    }
  }
  return lembretes.sort((a, b) => a.dia.localeCompare(b.dia) || a.nome.localeCompare(b.nome));
}
