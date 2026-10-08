import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import { hoje } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import type { Tarefa } from "@/lib/tarefas";
import { Planilha, type Coluna, type Linha } from "../Planilha";
import { salvarTarefa, salvarTarefaPontual } from "./actions";

const SIM_NAO = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
];
type Opcao = { valor: string; rotulo: string };

const base = (usuarios: Opcao[]): Coluna[] => [
  { campo: "titulo", rotulo: "Tarefa", tipo: "texto", obrigatorio: true, largura: "min-w-72" },
  { campo: "descricao", rotulo: "Explicação (opcional)", tipo: "texto", largura: "min-w-80" },
  { campo: "usuario_id", rotulo: "Usuário", tipo: "opcoes", obrigatorio: true, largura: "w-52", opcoes: usuarios },
];
const ATIVA: Coluna = { campo: "ativo", rotulo: "Ativa", tipo: "opcoes", obrigatorio: true, largura: "w-24", opcoes: SIM_NAO };

const colunasRecorrentes = (usuarios: Opcao[]): Coluna[] => [
  ...base(usuarios),
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
  { campo: "dia_inicio", rotulo: "Dia do mês (mensal)", tipo: "inteiro", largura: "w-32" },
  ATIVA,
];

const colunasPontuais = (usuarios: Opcao[]): Coluna[] => [
  ...base(usuarios),
  { campo: "data_inicio", rotulo: "A partir de", tipo: "data", largura: "w-40" },
  { campo: "pendente", rotulo: "Pendente há", tipo: "info", largura: "w-28" },
  ATIVA,
];

// Cadastro das tarefas do checklist que aparece ao entrar no sistema (módulo ADM), em dois blocos: primeiro as pontuais
// ainda pendentes, depois as recorrentes (todo dia, todo mês). Pontual concluída sai daqui e fica só no log.
export default async function TarefasPage() {
  await exigirModulo("adm");
  const supabase = await createClient();
  const [{ data }, { data: perfis }, { data: feitas }] = await Promise.all([
    supabase.from("tarefas").select("*").order("created_at"),
    supabase.from("profiles").select("id, nome, ativo").order("nome"),
    supabase.from("tarefas_feitas").select("tarefa_id").eq("periodo", "unica"),
  ]);
  const usuarios = (perfis ?? []).filter((p) => p.ativo).map((p) => ({ valor: p.id as string, rotulo: p.nome as string }));
  const concluidas = new Set((feitas ?? []).map((f) => f.tarefa_id as string));
  const dataHoje = hoje();
  const tarefas = (data ?? []) as (Tarefa & { created_at: string })[];

  const pendenteHa = (t: Tarefa & { created_at: string }) => {
    const inicio = t.data_inicio ?? t.created_at.slice(0, 10);
    if (inicio > dataHoje) return "ainda não começou";
    const dias = Math.round((Date.parse(dataHoje) - Date.parse(inicio)) / 86400000);
    return dias === 0 ? "hoje" : `${dias} ${dias === 1 ? "dia" : "dias"}`;
  };
  const paraLinha = (t: Tarefa & { created_at: string }): Linha => ({
    id: t.id,
    titulo: t.titulo,
    descricao: t.descricao,
    // Tarefa antiga (por módulo): fica sem usuário até ser editada.
    usuario_id: t.usuario_id,
    recorrencia: t.recorrencia,
    dia_inicio: t.recorrencia === "mensal" ? String(t.dia_inicio) : null,
    data_inicio: t.recorrencia === "pontual" ? t.data_inicio : null,
    pendente: t.recorrencia === "pontual" ? pendenteHa(t) : null,
    ativo: t.ativo ? "sim" : "nao",
  });
  const recorrentes = tarefas.filter((t) => t.recorrencia !== "pontual").map(paraLinha);
  const pontuais = tarefas.filter((t) => t.recorrencia === "pontual" && !concluidas.has(t.id)).map(paraLinha);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Cadastro de tarefas</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Cada tarefa é de um usuário e aparece no checklist dele, ao entrar no sistema, até ser marcada como feita.
            Todo dia: volta no dia seguinte. Todo mês: aparece no dia do mês escolhido e, marcada, volta no mesmo dia do mês
            seguinte. Pontual: aparece a partir da data escolhida até ser feita, uma vez só; concluída, sai desta tela e fica
            no log. Para tirar uma tarefa do checklist, marque Ativa = Não.
          </p>
        </div>
        <Link href="/tarefas/log" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Ver log de tarefas
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Tarefas pontuais pendentes de solução</h2>
        <Planilha
          colunas={colunasPontuais(usuarios)}
          linhas={pontuais}
          salvar={salvarTarefaPontual}
          rotuloNovo="+ Nova tarefa pontual"
          padroesNovo={{ ativo: "sim", data_inicio: dataHoje }}
          vazio="Nenhuma tarefa pontual pendente. As concluídas ficam no log de tarefas."
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Tarefas recorrentes</h2>
        <Planilha
          colunas={colunasRecorrentes(usuarios)}
          linhas={recorrentes}
          salvar={salvarTarefa}
          rotuloNovo="+ Nova tarefa recorrente"
          padroesNovo={{ recorrencia: "diaria", ativo: "sim" }}
          vazio="Nenhuma tarefa recorrente."
        />
      </section>
    </div>
  );
}
