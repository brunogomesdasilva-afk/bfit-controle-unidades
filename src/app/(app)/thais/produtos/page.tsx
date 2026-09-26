import { exigirAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Planilha, type Coluna, type Linha } from "../../Planilha";
import { excluirProduto, salvarProduto } from "./actions";

const BANHOS = ["Ouro 18k", "Ouro rosé", "Prata", "Ródio branco", "Ródio negro", "Sem banho"];

const COLUNAS: Coluna[] = [
  { campo: "sku", rotulo: "SKU", tipo: "texto", obrigatorio: true, largura: "w-28" },
  { campo: "descricao", rotulo: "Descrição", tipo: "texto", largura: "min-w-48" },
  { campo: "data_fabricacao", rotulo: "Fabricação", tipo: "data", largura: "w-32" },
  { campo: "tipo_banho", rotulo: "Tipo de banho", tipo: "opcoes", largura: "w-36", opcoes: BANHOS.map((b) => ({ valor: b, rotulo: b })) },
  { campo: "ouro_milesimos", rotulo: "Ouro (milésimos)", tipo: "decimal", largura: "w-28" },
  { campo: "preco_custo", rotulo: "Preço de custo", tipo: "moeda", obrigatorio: true, largura: "w-32" },
  { campo: "markup", rotulo: "Markup", tipo: "decimal", obrigatorio: true, largura: "w-24" },
  { campo: "preco_venda", rotulo: "Preço ao consumidor", tipo: "calculado", largura: "w-32", emReais: true },
  { campo: "margem_valor", rotulo: "Margem (R$)", tipo: "calculado", largura: "w-28", emReais: true },
  { campo: "margem_percentual", rotulo: "Margem (%)", tipo: "percentual", largura: "w-24" },
  { campo: "reposicao", rotulo: "Reposição de matéria-prima", tipo: "calculado", largura: "w-32", emReais: true },
];

type Produto = Record<string, string | number | null> & { id: string };

// Cadastro de produtos de joias da Thais: cada SKU com fabricação, banho, ouro, custo e markup; o sistema
// calcula preço ao consumidor, margem e o valor a guardar para repor a matéria-prima.
export default async function ProdutosThaisPage() {
  await exigirAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("produtos_joias").select("*").order("sku");
  const produtos = (data ?? []) as Produto[];
  const linhas: Linha[] = produtos.map((p) => {
    const l: Linha = { id: p.id };
    for (const c of COLUNAS) l[c.campo] = p[c.campo] === null || p[c.campo] === undefined ? null : String(p[c.campo]);
    return l;
  });
  const soma = (campo: string) => produtos.reduce((t, p) => t + (Number(p[campo]) || 0), 0);
  const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">Thais</p>
      <h1 className="text-lg font-semibold text-slate-900">Cadastro de produtos</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">
        Preencha custo e markup: o preço ao consumidor (custo × markup), a margem e a reposição de matéria-prima (o custo
        da peça, a separar a cada venda) são calculados automaticamente, nas colunas cinza.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Produtos (SKUs)", produtos.length.toLocaleString("pt-BR")],
          ["Custo total (1 de cada)", moeda(soma("preco_custo"))],
          ["Venda total (1 de cada)", moeda(soma("preco_venda"))],
          ["Margem total (1 de cada)", moeda(soma("margem_valor"))],
        ].map(([t, v]) => (
          <div key={t} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">{t}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{v}</p>
          </div>
        ))}
      </div>
      <Planilha
        colunas={COLUNAS}
        linhas={linhas}
        salvar={salvarProduto}
        excluir={excluirProduto}
        padroesNovo={{ markup: "2,5" }}
        rotuloNovo="+ Novo produto"
        vazio="Nenhum produto cadastrado. Clique em “+ Novo produto”."
      />
    </div>
  );
}
