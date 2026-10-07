import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import { MODULOS } from "@/lib/modulos";
import { createClient } from "@/lib/supabase/server";
import type { Tarefa } from "@/lib/tarefas";
import { Planilha, type Coluna, type Linha } from "../Planilha";
import { salvarTarefa } from "./actions";

const SIM_NAO = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
];

const COLUNAS: Coluna[] = [
  { campo: "titulo", rotulo: "Tarefa", tipo: "texto", obrigatorio: true, largura: "min-w-72" },
  { campo: "descricao", rotulo: "Explicação (opcional)", tipo: "texto", largura: "min-w-80" },
  {
    campo: "modulo",
    rotulo: "Para quem",
    tipo: "opcoes",
    obrigatorio: true,
    largura: "w-44",
    opcoes: [{ valor: "todos", rotulo: "Todos os usuários" }, ...Object.entries(MODULOS).map(([valor, rotulo]) => ({ valor, rotulo: `Módulo ${rotulo}` }))],
  },
  { campo: "incluir_admin", rotulo: "Inclui administradores", tipo: "opcoes", obrigatorio: true, largura: "w-36", opcoes: SIM_NAO },
  {
    campo: "recorrencia",
    rotulo: "Repete",
    tipo: "opcoes",
    obrigatorio: true,
    largura: "w-32",
    opcoes: [
      { valor: "diaria", rotulo: "Todo dia" },
      { valor: "mensal", rotulo: "Todo mês" },
    ],
  },
  { campo: "dia_inicio", rotulo: "A partir do dia (mensal)", tipo: "inteiro", largura: "w-36" },
  { campo: "ativo", rotulo: "Ativa", tipo: "opcoes", obrigatorio: true, largura: "w-24", opcoes: SIM_NAO },
];

// Cadastro das tarefas do checklist que aparece ao entrar no sistema (módulo ADM).
export default async function TarefasPage() {
  await exigirModulo("adm");
  const supabase = await createClient();
  const { data } = await supabase.from("tarefas").select("*").order("created_at");
  const linhas: Linha[] = ((data ?? []) as Tarefa[]).map((t) => ({
    id: t.id,
    titulo: t.titulo,
    descricao: t.descricao,
    modulo: t.modulo ?? "todos",
    incluir_admin: t.incluir_admin ? "sim" : "nao",
    recorrencia: t.recorrencia,
    dia_inicio: t.recorrencia === "mensal" ? String(t.dia_inicio) : null,
    ativo: t.ativo ? "sim" : "nao",
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Cadastro de tarefas</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Cada tarefa aparece no checklist dos usuários do tipo de acesso escolhido, ao entrar no sistema, até ser marcada
            como feita: todo dia, ou todo mês a partir do dia escolhido. Para tirar uma tarefa do checklist, marque Ativa =
            Não (o histórico continua no log).
          </p>
        </div>
        <Link href="/tarefas/log" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Ver log de tarefas
        </Link>
      </div>
      <Planilha
        colunas={COLUNAS}
        linhas={linhas}
        salvar={salvarTarefa}
        rotuloNovo="+ Nova tarefa"
        padroesNovo={{ modulo: "todos", incluir_admin: "nao", recorrencia: "diaria", ativo: "sim" }}
        vazio="Nenhuma tarefa cadastrada."
      />
    </div>
  );
}
