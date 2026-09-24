import { createClient } from "@/lib/supabase/server";
import type { Modalidade } from "@/lib/database.types";
import { Planilha, type Coluna, type Linha } from "../../../Planilha";
import { excluirModalidade, salvarModalidade } from "../actions";

const COLUNAS: Coluna[] = [{ campo: "nome", rotulo: "Modalidade", tipo: "texto", obrigatorio: true }];

export default async function ModalidadesPage({ params }: PageProps<"/academias/[id]/modalidades">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("modalidades").select("*").eq("academia_id", id).order("nome");
  const linhas: Linha[] = ((data ?? []) as Modalidade[]).map((m) => ({ id: m.id, nome: m.nome }));

  return (
    <div className="max-w-xl">
      <p className="mb-3 text-sm text-slate-500">
        As modalidades cadastradas aqui aparecem como lista nas contagens de coletivas e de lutas desta academia.
      </p>
      <Planilha
        colunas={COLUNAS}
        linhas={linhas}
        salvar={salvarModalidade.bind(null, id)}
        excluir={excluirModalidade}
        rotuloNovo="+ Nova modalidade"
        vazio="Nenhuma modalidade cadastrada. Clique em “+ Nova modalidade”."
      />
    </div>
  );
}
