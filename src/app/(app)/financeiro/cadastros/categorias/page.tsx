import { exigirModulo } from "@/lib/auth";
import type { Grupo } from "@/lib/financeiro";
import { createClient } from "@/lib/supabase/server";
import { Planilha, type Coluna, type Linha } from "../../../Planilha";
import { salvarCategoria, salvarGrupo } from "../../acoes";

// Financeiro > Cadastros > Categorias: primeiro os grupos (ex.: "Custo com Operação", tipo despesa), depois as
// categorias de cada grupo (ex.: Aluguel, Energia). O tipo da categoria (receita, despesa, transferência) é o do grupo.

const TIPOS = [
  { valor: "receita", rotulo: "Receita (entrada)" },
  { valor: "despesa", rotulo: "Despesa (saída)" },
  { valor: "transferencia", rotulo: "Transferência" },
];
const SIM_NAO = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
];

export default async function CategoriasPage() {
  await exigirModulo("financeiro");
  const supabase = await createClient();
  const [{ data: gruposData }, { data: categoriasData }] = await Promise.all([
    supabase.from("fin_grupos").select("*").order("tipo").order("nome"),
    supabase.from("fin_categorias").select("id, nome, grupo_id, ativo").order("nome"),
  ]);
  const grupos = (gruposData ?? []) as Grupo[];
  const nomeTipo = (t: string) => TIPOS.find((x) => x.valor === t)?.rotulo ?? t;
  const colunasGrupos: Coluna[] = [
    { campo: "nome", rotulo: "Grupo", tipo: "texto", obrigatorio: true, largura: "min-w-72" },
    { campo: "tipo", rotulo: "Tipo", tipo: "opcoes", obrigatorio: true, largura: "w-48", opcoes: TIPOS },
    { campo: "ativo", rotulo: "Ativo", tipo: "opcoes", obrigatorio: true, largura: "w-24", opcoes: SIM_NAO },
  ];
  const colunasCategorias: Coluna[] = [
    {
      campo: "grupo_id",
      rotulo: "Grupo",
      tipo: "opcoes",
      obrigatorio: true,
      largura: "w-72",
      opcoes: grupos.filter((g) => g.ativo).map((g) => ({ valor: g.id, rotulo: `${g.nome} (${nomeTipo(g.tipo).split(" ")[0].toLowerCase()})` })),
    },
    { campo: "nome", rotulo: "Categoria", tipo: "texto", obrigatorio: true, largura: "min-w-72" },
    { campo: "ativo", rotulo: "Ativa", tipo: "opcoes", obrigatorio: true, largura: "w-24", opcoes: SIM_NAO },
  ];
  const ordemGrupo = new Map(grupos.map((g, i) => [g.id, i]));
  const linhasCategorias: Linha[] = ((categoriasData ?? []) as { id: string; nome: string; grupo_id: string; ativo: boolean }[])
    .sort((a, b) => (ordemGrupo.get(a.grupo_id) ?? 0) - (ordemGrupo.get(b.grupo_id) ?? 0) || a.nome.localeCompare(b.nome))
    .map((c) => ({ id: c.id, grupo_id: c.grupo_id, nome: c.nome, ativo: c.ativo ? "sim" : "nao" }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Grupos e categorias</h1>
        <p className="text-sm text-slate-500">
          Cadastre primeiro os grupos (como no fluxo de caixa: Receitas Diretas, Custo com Operação, Despesas com Pessoal…) e depois as
          categorias de cada grupo. Para tirar um grupo ou categoria das listas, marque Ativo = Não.
        </p>
      </div>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Grupos</h2>
        <Planilha
          colunas={colunasGrupos}
          linhas={grupos.map((g) => ({ id: g.id, nome: g.nome, tipo: g.tipo, ativo: g.ativo ? "sim" : "nao" }))}
          salvar={salvarGrupo}
          rotuloNovo="+ Incluir grupo"
          padroesNovo={{ tipo: "despesa", ativo: "sim" }}
          vazio="Nenhum grupo. Comece por aqui."
        />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Categorias</h2>
        {grupos.length === 0 ? (
          <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">Cadastre um grupo antes das categorias.</p>
        ) : (
          <Planilha colunas={colunasCategorias} linhas={linhasCategorias} salvar={salvarCategoria} rotuloNovo="+ Incluir categoria" padroesNovo={{ ativo: "sim" }} vazio="Nenhuma categoria." />
        )}
      </section>
    </div>
  );
}
