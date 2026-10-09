import type { Modulo } from "@/lib/modulos";

// Checklist de tarefas dos usuários (cadastro e log no módulo ADM). Cada tarefa é de um usuário ou de um grupo
// (ex.: Gerentes: cada membro marca a sua) e se repete todo dia útil (diária: segunda a sexta, menos feriados), todo
// mês a partir de um dia (mensal: marcada, volta no mesmo dia do mês seguinte) ou é pontual (aparece a partir de uma
// data até ser feita, uma vez só). Tarefa cancelada sai do checklist. Tarefas antigas, por módulo (sem usuário nem
// grupo), continuam valendo para quem tem o módulo até serem editadas.

export type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  usuario_id: string | null; // o usuário da tarefa
  grupo_id: string | null; // ou o grupo (cada membro faz a sua)
  membros?: string[]; // membros do grupo (preenchido ao carregar)
  cancelada_em: string | null;
  cancelada_por?: string | null;
  modulo: Modulo | null; // só nas antigas: null = todos os usuários
  incluir_admin: boolean;
  recorrencia: "diaria" | "mensal" | "pontual";
  dia_inicio: number;
  data_inicio: string | null; // pontual: aparece a partir desta data
  ativo: boolean;
};

export type Pendente = { id: string; titulo: string; descricao: string | null; periodo: string; rotuloPeriodo: string };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Dia útil: segunda a sexta que não é feriado.
export function diaUtil(data: string, feriados: Set<string>) {
  const dia = new Date(`${data}T12:00:00Z`).getUTCDay();
  return dia >= 1 && dia <= 5 && !feriados.has(data);
}

// Período da tarefa em que "hoje" cai (aaaa-mm-dd, aaaa-mm ou "unica"); null se ainda não começou (ou, na diária,
// se hoje não é dia útil).
export function periodoDe(t: Pick<Tarefa, "recorrencia" | "dia_inicio" | "data_inicio">, hoje: string, feriados: Set<string> = new Set()) {
  if (t.recorrencia === "diaria") return diaUtil(hoje, feriados) ? hoje : null;
  if (t.recorrencia === "pontual") return !t.data_inicio || hoje >= t.data_inicio ? "unica" : null;
  return Number(hoje.slice(8, 10)) >= t.dia_inicio ? hoje.slice(0, 7) : null;
}

export function rotuloDoPeriodo(periodo: string) {
  if (periodo === "unica") return "pontual";
  if (periodo.length === 7) return `${MESES[Number(periodo.slice(5, 7)) - 1]}/${periodo.slice(0, 4)}`;
  return periodo.split("-").reverse().join("/");
}

// A tarefa é para este usuário? A do usuário; nas antigas, pelo módulo (vazio = todos) e administradores só se incluídos.
export function seAplica(
  t: Pick<Tarefa, "usuario_id" | "grupo_id" | "membros" | "modulo" | "incluir_admin" | "ativo" | "cancelada_em">,
  usuario: { id: string; perfil: string; modulos: Modulo[] }
) {
  if (!t.ativo || t.cancelada_em) return false;
  if (t.usuario_id) return t.usuario_id === usuario.id;
  if (t.grupo_id) return (t.membros ?? []).includes(usuario.id);
  if (!t.incluir_admin && usuario.perfil === "admin") return false;
  return !t.modulo || usuario.modulos.includes(t.modulo);
}

// Tarefas do usuário que ainda não foram marcadas no período atual.
export function pendentesDe(
  tarefas: Tarefa[],
  feitas: { tarefa_id: string; periodo: string }[],
  usuario: { id: string; perfil: string; modulos: Modulo[] },
  hoje: string,
  feriados: Set<string> = new Set()
): Pendente[] {
  const marcadas = new Set(feitas.map((f) => `${f.tarefa_id}|${f.periodo}`));
  return tarefas.flatMap((t) => {
    const periodo = periodoDe(t, hoje, feriados);
    if (!periodo || !seAplica(t, usuario) || marcadas.has(`${t.id}|${periodo}`)) return [];
    return [{ id: t.id, titulo: t.titulo, descricao: t.descricao, periodo, rotuloPeriodo: rotuloDoPeriodo(periodo) }];
  });
}

// Tarefas com os membros dos grupos e os feriados nacionais (para os dias úteis).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function carregarTarefas(supabase: any, { soAtivas = false } = {}) {
  let q = supabase.from("tarefas").select("*").order("created_at");
  if (soAtivas) q = q.eq("ativo", true).is("cancelada_em", null);
  const [{ data: tarefas }, { data: grupos }, { data: feriados }] = await Promise.all([
    q,
    supabase.from("tarefa_grupos").select("id, nome, membros, ativo").order("nome"),
    supabase.from("feriados").select("data").is("academia_id", null),
  ]);
  const lista = ((grupos ?? []) as { id: string; nome: string; membros: string[]; ativo: boolean }[]);
  return {
    tarefas: ((tarefas ?? []) as Tarefa[]).map((t) => ({ ...t, membros: lista.find((g) => g.id === t.grupo_id)?.membros ?? [] })),
    grupos: lista,
    feriados: new Set(((feriados ?? []) as { data: string }[]).map((f) => f.data)),
  };
}
