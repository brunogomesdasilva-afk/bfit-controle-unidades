import { exigirModulo } from "@/lib/auth";
import type { Categoria } from "@/lib/financeiro";
import { createClient } from "@/lib/supabase/server";
import { Planilha, type Coluna, type Linha } from "../../../Planilha";
import { salvarCategoria } from "../../acoes";

// Financeiro > Cadastros > Categorias: o plano de categorias (com o grupo) usado nas contas a pagar e a receber e
// nos relatórios. Começa com as categorias do fluxo financeiro atual.
const COLUNAS: Coluna[] = [
  { campo: "grupo", rotulo: "Grupo", tipo: "texto", obrigatorio: true, largura: "w-64" },
  { campo: "nome", rotulo: "Categoria", tipo: "texto", obrigatorio: true, largura: "min-w-72" },
  {
    campo: "tipo",
    rotulo: "Tipo",
    tipo: "opcoes",
    obrigatorio: true,
    largura: "w-40",
    opcoes: [
      { valor: "receita", rotulo: "Receita (entrada)" },
      { valor: "despesa", rotulo: "Despesa (saída)" },
      { valor: "transferencia", rotulo: "Transferência" },
    ],
  },
  { campo: "ativo", rotulo: "Ativa", tipo: "opcoes", obrigatorio: true, largura: "w-24", opcoes: [{ valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não" }] },
];

export default async function CategoriasPage() {
  await exigirModulo("financeiro");
  const supabase = await createClient();
  const { data } = await supabase.from("fin_categorias").select("*").order("tipo").order("grupo").order("nome");
  const linhas: Linha[] = ((data ?? []) as Categoria[]).map((c) => ({ id: c.id, grupo: c.grupo, nome: c.nome, tipo: c.tipo, ativo: c.ativo ? "sim" : "nao" }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Categorias</h1>
        <p className="text-sm text-slate-500">Plano de categorias do financeiro, agrupado como no fluxo de caixa. Para tirar uma categoria das listas, marque Ativa = Não.</p>
      </div>
      <Planilha colunas={COLUNAS} linhas={linhas} salvar={salvarCategoria} rotuloNovo="+ Incluir categoria" padroesNovo={{ tipo: "despesa", ativo: "sim" }} vazio="Nenhuma categoria." />
    </div>
  );
}
