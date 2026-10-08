import type { Modulo } from "@/lib/modulos";

// Checklist de tarefas dos usuários (cadastro e log no módulo ADM). Cada tarefa é de um usuário e se repete todo
// dia (diária), todo mês a partir de um dia (mensal: marcada, volta no mesmo dia do mês seguinte) ou é pontual
// (aparece a partir de uma data até ser feita, uma vez só). Tarefas antigas, por módulo (sem usuário), continuam
// valendo para quem tem o módulo até serem editadas.

export type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  usuario_id: string | null; // o usuário da tarefa (as antigas, sem usuário, valem pelo módulo)
  modulo: Modulo | null; // só nas antigas: null = todos os usuários
  incluir_admin: boolean;
  recorrencia: "diaria" | "mensal" | "pontual";
  dia_inicio: number;
  data_inicio: string | null; // pontual: aparece a partir desta data
  ativo: boolean;
};

export type Pendente = { id: string; titulo: string; descricao: string | null; periodo: string; rotuloPeriodo: string };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Período da tarefa em que "hoje" cai (aaaa-mm-dd, aaaa-mm ou "unica"); null se ainda não começou.
export function periodoDe(t: Pick<Tarefa, "recorrencia" | "dia_inicio" | "data_inicio">, hoje: string) {
  if (t.recorrencia === "diaria") return hoje;
  if (t.recorrencia === "pontual") return !t.data_inicio || hoje >= t.data_inicio ? "unica" : null;
  return Number(hoje.slice(8, 10)) >= t.dia_inicio ? hoje.slice(0, 7) : null;
}

export function rotuloDoPeriodo(periodo: string) {
  if (periodo === "unica") return "pontual";
  if (periodo.length === 7) return `${MESES[Number(periodo.slice(5, 7)) - 1]}/${periodo.slice(0, 4)}`;
  return periodo.split("-").reverse().join("/");
}

// A tarefa é para este usuário? A do usuário; nas antigas, pelo módulo (vazio = todos) e administradores só se incluídos.
export function seAplica(t: Pick<Tarefa, "usuario_id" | "modulo" | "incluir_admin" | "ativo">, usuario: { id: string; perfil: string; modulos: Modulo[] }) {
  if (!t.ativo) return false;
  if (t.usuario_id) return t.usuario_id === usuario.id;
  if (!t.incluir_admin && usuario.perfil === "admin") return false;
  return !t.modulo || usuario.modulos.includes(t.modulo);
}

// Tarefas do usuário que ainda não foram marcadas no período atual.
export function pendentesDe(tarefas: Tarefa[], feitas: { tarefa_id: string; periodo: string }[], usuario: { id: string; perfil: string; modulos: Modulo[] }, hoje: string): Pendente[] {
  const marcadas = new Set(feitas.map((f) => `${f.tarefa_id}|${f.periodo}`));
  return tarefas.flatMap((t) => {
    const periodo = periodoDe(t, hoje);
    if (!periodo || !seAplica(t, usuario) || marcadas.has(`${t.id}|${periodo}`)) return [];
    return [{ id: t.id, titulo: t.titulo, descricao: t.descricao, periodo, rotuloPeriodo: rotuloDoPeriodo(periodo) }];
  });
}
