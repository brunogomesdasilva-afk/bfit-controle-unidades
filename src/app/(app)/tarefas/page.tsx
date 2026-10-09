import Link from "next/link";
import { exigirModulo } from "@/lib/auth";
import { hoje } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";
import { carregarTarefas, type Tarefa } from "@/lib/tarefas";
import { Planilha, type Coluna, type Linha } from "../Planilha";
import { cancelarTarefa, salvarTarefa, salvarTarefaPontual } from "./actions";
import { GruposTarefas } from "./GruposTarefas";

const SIM_NAO = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
];
type Opcao = { valor: string; rotulo: string; grupo?: string };

const base = (usuarios: Opcao[]): Coluna[] => [
  { campo: "titulo", rotulo: "Tarefa", tipo: "texto", obrigatorio: true, largura: "min-w-72" },
  { campo: "descricao", rotulo: "Explicação (opcional)", tipo: "texto", largura: "min-w-80" },
  { campo: "para", rotulo: "Para quem", tipo: "opcoes", obrigatorio: true, largura: "w-56", opcoes: usuarios },
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
      { valor: "diaria", rotulo: "Todo dia útil" },
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
  const [{ tarefas: todas, grupos }, { data: perfis }, { data: feitas }] = await Promise.all([
    carregarTarefas(supabase),
    supabase.from("profiles").select("id, nome, ativo, perfil, academia_id").order("nome"),
    supabase.from("tarefas_feitas").select("tarefa_id").eq("periodo", "unica"),
  ]);
  // "Para quem": os grupos primeiro (cada membro faz a sua), depois cada usuário.
  const ativos = (perfis ?? []).filter((p) => p.ativo);
  const usuarios: Opcao[] = [
    ...grupos.filter((g) => g.ativo).map((g) => ({ valor: `g:${g.id}`, rotulo: `Grupo ${g.nome}` })),
    ...ativos.map((p) => ({ valor: `u:${p.id}`, rotulo: p.nome as string })),
  ];
  const concluidas = new Set((feitas ?? []).map((f) => f.tarefa_id as string));
  const dataHoje = hoje();
  // Canceladas saem do cadastro (ficam no log).
  const tarefas = todas.filter((x) => !x.cancelada_em) as (Tarefa & { created_at: string })[];

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
    // Tarefa antiga (por módulo): fica sem "para quem" até ser editada.
    para: t.grupo_id ? `g:${t.grupo_id}` : t.usuario_id ? `u:${t.usuario_id}` : null,
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
            Cada tarefa é de um usuário ou de um grupo (cada membro faz e marca a sua) e aparece no checklist ao entrar no
            sistema até ser marcada. Todo dia útil: de segunda a sexta, menos feriados. Todo mês: aparece no dia escolhido e,
            marcada, volta no mesmo dia do mês seguinte. Pontual: aparece a partir da data até ser feita, uma vez só.
            Cancelar tira a tarefa do checklist de vez (fica no log); Ativa = Não só suspende.
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
          excluir={cancelarTarefa}
          rotuloExcluir="Cancelar"
          confirmarExcluir="Cancelar esta tarefa? Ela sai do checklist de todos e fica só no log."
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
          excluir={cancelarTarefa}
          rotuloExcluir="Cancelar"
          confirmarExcluir="Cancelar esta tarefa? Ela sai do checklist de todos e fica só no log."
          rotuloNovo="+ Nova tarefa recorrente"
          padroesNovo={{ recorrencia: "diaria", ativo: "sim" }}
          vazio="Nenhuma tarefa recorrente."
        />
      </section>

      <GruposTarefas
        grupos={grupos.map((g) => ({ id: g.id, nome: g.nome, membros: g.membros }))}
        usuarios={ativos.map((p) => ({ id: p.id as string, nome: p.nome as string, descricao: p.perfil === "admin" ? "administrador" : p.academia_id ? "gerente" : "" }))}
      />
    </div>
  );
}
