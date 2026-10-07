import type { Modulo } from "@/lib/modulos";

// Checklist de tarefas dos usuários (cadastro e log no módulo ADM). Cada tarefa vale para um tipo de acesso
// (módulo, com ou sem administradores) e se repete todo dia (diária) ou uma vez por mês a partir de um dia
// (mensal); fica pendente até o usuário marcar como feita naquele período.

export type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  modulo: Modulo | null; // null: todos os usuários
  incluir_admin: boolean;
  recorrencia: "diaria" | "mensal";
  dia_inicio: number;
  ativo: boolean;
};

export type Pendente = { id: string; titulo: string; descricao: string | null; periodo: string; rotuloPeriodo: string };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Período da tarefa em que "hoje" cai (aaaa-mm-dd ou aaaa-mm); null se ainda não começou (mensal antes do dia).
export function periodoDe(t: Pick<Tarefa, "recorrencia" | "dia_inicio">, hoje: string) {
  if (t.recorrencia === "diaria") return hoje;
  return Number(hoje.slice(8, 10)) >= t.dia_inicio ? hoje.slice(0, 7) : null;
}

export function rotuloDoPeriodo(periodo: string) {
  if (periodo.length === 7) return `${MESES[Number(periodo.slice(5, 7)) - 1]}/${periodo.slice(0, 4)}`;
  return periodo.split("-").reverse().join("/");
}

// A tarefa é para este usuário? Pelo módulo (vazio = todos) e, se não incluir administradores, só os demais.
export function seAplica(t: Pick<Tarefa, "modulo" | "incluir_admin" | "ativo">, usuario: { perfil: string; modulos: Modulo[] }) {
  if (!t.ativo) return false;
  if (!t.incluir_admin && usuario.perfil === "admin") return false;
  return !t.modulo || usuario.modulos.includes(t.modulo);
}

// Tarefas do usuário que ainda não foram marcadas no período atual.
export function pendentesDe(tarefas: Tarefa[], feitas: { tarefa_id: string; periodo: string }[], usuario: { perfil: string; modulos: Modulo[] }, hoje: string): Pendente[] {
  const marcadas = new Set(feitas.map((f) => `${f.tarefa_id}|${f.periodo}`));
  return tarefas.flatMap((t) => {
    const periodo = periodoDe(t, hoje);
    if (!periodo || !seAplica(t, usuario) || marcadas.has(`${t.id}|${periodo}`)) return [];
    return [{ id: t.id, titulo: t.titulo, descricao: t.descricao, periodo, rotuloPeriodo: rotuloDoPeriodo(periodo) }];
  });
}
