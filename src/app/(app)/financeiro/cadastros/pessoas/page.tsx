import { exigirModulo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listasFinanceiro } from "../../listas";
import { Pessoas } from "./Pessoas";

// Financeiro > Cadastros > Clientes e fornecedores (valem para todas as academias).
export default async function PessoasPage() {
  await exigirModulo("financeiro");
  const supabase = await createClient();
  const { pessoas, opcoesCategoria } = await listasFinanceiro(supabase);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Clientes e fornecedores</h1>
        <p className="text-sm text-slate-500">
          Um cadastro só para clientes e fornecedores, usado por todas as academias. Pelo CNPJ, o sistema preenche os dados
          da Receita (razão social, regime, CNAE e cidade).
        </p>
      </div>
      <Pessoas pessoas={pessoas} categorias={opcoesCategoria()} />
    </div>
  );
}
