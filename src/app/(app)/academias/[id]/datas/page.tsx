import { createClient } from "@/lib/supabase/server";
import { hoje } from "@/lib/planilha";
import { Planilha, type Coluna, type Linha } from "../../../Planilha";
import { excluirDataImportante, salvarDataImportante } from "../actions";

// Aviso com antecedência: a partir de 30 dias para vencer.
const ANTECEDENCIA = 30;

const COLUNAS: Coluna[] = [
  { campo: "item", rotulo: "Item", tipo: "texto", obrigatorio: true, largura: "min-w-56" },
  { campo: "vencimento", rotulo: "Vencimento", tipo: "data", largura: "w-40" },
  { campo: "dias", rotulo: "Dias para vencer", tipo: "calculado", largura: "w-36" },
  { campo: "situacao", rotulo: "Situação", tipo: "situacao", largura: "w-44" },
  { campo: "observacao", rotulo: "Observação", tipo: "texto", largura: "min-w-56" },
];

type DataImportante = { id: string; item: string; vencimento: string | null; observacao: string | null };

const diasAte = (data: string) => Math.round((Date.parse(`${data}T12:00:00Z`) - Date.parse(`${hoje()}T12:00:00Z`)) / 86400000);

function situacao(dias: number | null) {
  if (dias === null) return "Sem data";
  if (dias < 0) return "Vencido";
  if (dias <= ANTECEDENCIA) return "Vence em breve";
  return "Em dia";
}

// Datas importantes da academia (PMOC, AVCB, CREF...): o item, a data limite de renovação e quantos dias faltam.
// Os mais urgentes aparecem primeiro; os sem data ficam no fim.
export default async function DatasImportantesPage({ params }: PageProps<"/academias/[id]/datas">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("datas_importantes")
    .select("id, item, vencimento, observacao")
    .eq("academia_id", id)
    .order("vencimento", { ascending: true, nullsFirst: false })
    .order("item");
  const linhas: Linha[] = ((data ?? []) as DataImportante[]).map((d) => {
    const dias = d.vencimento ? diasAte(d.vencimento) : null;
    return {
      id: d.id,
      item: d.item,
      vencimento: d.vencimento,
      dias: dias === null ? null : String(dias),
      situacao: situacao(dias),
      observacao: d.observacao,
    };
  });

  return (
    <div className="max-w-5xl">
      <p className="mb-3 text-sm text-slate-500">
        Licenças, manutenções e documentos com data de renovação. “Vence em breve” = faltam {ANTECEDENCIA} dias ou menos.
      </p>
      <Planilha
        colunas={COLUNAS}
        linhas={linhas}
        salvar={salvarDataImportante.bind(null, id)}
        excluir={excluirDataImportante}
        rotuloNovo="+ Nova data"
        vazio="Nenhuma data cadastrada. Clique em “+ Nova data”."
      />
    </div>
  );
}
