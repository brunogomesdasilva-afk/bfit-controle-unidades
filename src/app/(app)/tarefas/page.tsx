import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Tarefa } from "@/lib/tarefas";
import { Planilha, type Coluna, type Linha } from "../Planilha";
import { salvarTarefa } from "./actions";

const SIM_NAO = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
];

const colunas = (usuarios: { valor: string; rotulo: string }[]): Coluna[] => [
  { campo: "titulo", rotulo: "Tarefa", tipo: "texto", obrigatorio: true, largura: "min-w-72" },
  { campo: "descricao", rotulo: "Explicação (opcional)", tipo: "texto", largura: "min-w-80" },
  { campo: "usuario_id", rotulo: "Usuário", tipo: "opcoes", obrigatorio: true, largura: "w-52", opcoes: usuarios },
  {
    campo: "recorrencia",
    rotulo: "Repete",
    tipo: "opcoes",
    obrigatorio: true,
    largura: "w-32",
    opcoes: [
      { valor: "diaria", rotulo: "Todo dia" },
      { valor: "mensal", rotulo: "Todo mês" },
      { valor: "pontual", rotulo: "Pontual (uma vez)" },
    ],
  },
  { campo: "dia_inicio", rotulo: "Dia do mês (mensal)", tipo: "inteiro", largura: "w-32" },
  { campo: "data_inicio", rotulo: "A partir de (pontual)", tipo: "data", largura: "w-40" },
  { campo: "ativo", rotulo: "Ativa", tipo: "opcoes", obrigatorio: true, largura: "w-24", opcoes: SIM_NAO },
];

// Cadastro das tarefas do checklist que aparece ao entrar no sistema (módulo ADM).
export default async function TarefasPage() {
  await exigirModulo("adm");
  const supabase = await createClient();
  const [{ data }, { data: perfis }] = await Promise.all([
    supabase.from("tarefas").select("*").order("created_at"),
    supabase.from("profiles").select("id, nome, ativo").order("nome"),
  ]);
  const usuarios = (perfis ?? []).filter((p) => p.ativo).map((p) => ({ valor: p.id as string, rotulo: p.nome as string }));
  const linhas: Linha[] = ((data ?? []) as Tarefa[]).map((t) => ({
    id: t.id,
    titulo: t.titulo,
    descricao: t.descricao,
    // Tarefa antiga (por módulo): fica sem usuário até ser editada.
    usuario_id: t.usuario_id,
    recorrencia: t.recorrencia,
    dia_inicio: t.recorrencia === "mensal" ? String(t.dia_inicio) : null,
    data_inicio: t.recorrencia === "pontual" ? t.data_inicio : null,
    ativo: t.ativo ? "sim" : "nao",
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Cadastro de tarefas</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Cada tarefa é de um usuário e aparece no checklist dele, ao entrar no sistema, até ser marcada como feita.
            Todo dia: volta no dia seguinte. Todo mês: aparece no dia do mês escolhido e, marcada, volta no mesmo dia do mês
            seguinte. Pontual: aparece a partir da data escolhida até ser feita, uma vez só. Para tirar uma tarefa do
            checklist, marque Ativa = Não (o histórico continua no log).
          </p>
        </div>
        <Link href="/tarefas/log" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Ver log de tarefas
        </Link>
      </div>
      <Planilha
        colunas={colunas(usuarios)}
        linhas={linhas}
        salvar={salvarTarefa}
        rotuloNovo="+ Nova tarefa"
        padroesNovo={{ recorrencia: "diaria", ativo: "sim" }}
        vazio="Nenhuma tarefa cadastrada."
      />
    </div>
  );
}
