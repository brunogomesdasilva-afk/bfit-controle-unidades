import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth";
import type { Academia } from "@/lib/database.types";
import { Planilha, type Coluna, type Linha } from "../Planilha";
import { excluirAcademia, salvarAcademia } from "./actions";

const INVENTARIO = "Inventário de máquinas";

const COLUNAS: Coluna[] = [
  { campo: "nome", rotulo: "Nome da academia", tipo: "texto", obrigatorio: true, largura: "min-w-48" },
  { campo: "area_m2", rotulo: "Área (m²)", tipo: "decimal", largura: "w-28" },
  { campo: "custo_financeiro", rotulo: "Custo financeiro", tipo: "moeda", largura: "w-40" },
  { campo: "maquinas_peitoral", rotulo: "Peitoral", tipo: "inteiro", grupo: INVENTARIO, largura: "w-24" },
  { campo: "maquinas_costas", rotulo: "Costas", tipo: "inteiro", grupo: INVENTARIO, largura: "w-24" },
  { campo: "maquinas_pernas", rotulo: "Pernas", tipo: "inteiro", grupo: INVENTARIO, largura: "w-24" },
  { campo: "maquinas_bracos", rotulo: "Braços", tipo: "inteiro", grupo: INVENTARIO, largura: "w-24" },
  { campo: "maquinas_total", rotulo: "Total", tipo: "calculado", grupo: INVENTARIO, largura: "w-24" },
];

const texto = (n: number | null | undefined) => (n === null || n === undefined ? null : String(n));

export default async function AcademiasPage() {
  // O administrador cadastra e altera as academias; o usuário de uma academia só consulta a dele
  // (os funcionários e modalidades ele cuida no submenu da academia).
  const atual = await getPerfilAtual();
  if (!atual) redirect("/login");
  const admin = atual.perfil === "admin";
  const supabase = await createClient();
  const { data } = await supabase.from("academias").select("*").order("nome");
  const linhas: Linha[] = ((data ?? []) as Academia[]).map((a) => {
    const [peitoral, costas, pernas, bracos] = [
      a.maquinas_peitoral,
      a.maquinas_costas,
      a.maquinas_pernas,
      a.maquinas_bracos,
    ].map((n) => n ?? 0);
    return {
      id: a.id,
      nome: a.nome,
      area_m2: texto(a.area_m2),
      custo_financeiro: texto(a.custo_financeiro),
      maquinas_peitoral: texto(peitoral),
      maquinas_costas: texto(costas),
      maquinas_pernas: texto(pernas),
      maquinas_bracos: texto(bracos),
      maquinas_total: texto(peitoral + costas + pernas + bracos),
    };
  });

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Academias</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">
        Tamanho, custo financeiro e inventário de máquinas de cada academia. Cada compra e manutenção fica ligada a
        uma academia; uma academia só pode ser excluída se não tiver lançamentos nem usuários.
      </p>
      <Planilha
        colunas={COLUNAS}
        linhas={linhas}
        salvar={admin ? salvarAcademia : undefined}
        excluir={admin ? excluirAcademia : undefined}
        padroesNovo={{ maquinas_peitoral: "0", maquinas_costas: "0", maquinas_pernas: "0", maquinas_bracos: "0" }}
        rotuloNovo="+ Nova academia"
        somenteLeitura={
          admin
            ? undefined
            : "Os dados da academia são alterados pelo administrador. Funcionários e modalidades: abra a academia no menu ao lado."
        }
        vazio="Nenhuma academia cadastrada. Clique em “+ Nova academia”."
      />
    </div>
  );
}
