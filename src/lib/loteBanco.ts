import type { SupabaseClient } from "@supabase/supabase-js";
import { faltasCobranca, formaDePagamento, type ParametrosCnab, type Pessoa, type TituloCnab } from "@/lib/cnab";
import { hoje } from "@/lib/planilha";
import type { createClient } from "@/lib/supabase/server";

// Títulos em aberto de uma conta para o lote do banco (Financeiro > Relatórios > Gerar lote para o banco), já com a
// forma de pagamento (pagar) ou o que falta no cadastro do cliente (receber).

type Supabase = Awaited<ReturnType<typeof createClient>> | SupabaseClient;

export type ItemLote = TituloCnab & {
  fornecedor: string;
  previsao: string;
  forma: string | null; // rótulo da forma de pagamento (pagar) ou "Boleto" (receber)
  problema: string | null; // por que não pode entrar no lote
};

const CAMPOS_PESSOA = "id, razao_social, nome_fantasia, documento, banco, agencia, conta, tipo_conta, chave_pix, tipo_chave_pix, logradouro, numero, complemento, bairro, cidade, uf, cep";

export async function titulosParaLote(
  supabase: Supabase,
  tipo: "pagar" | "receber",
  contaId: string,
  bancoDaConta: string,
  filtro: { de: string; ate: string } | { ids: string[] }
): Promise<ItemLote[]> {
  let q = supabase
    .from("fin_titulos_situacao")
    .select("id, pessoa_id, documento, vencimento, previsao, data_registro, saldo, codigo_barras, nosso_numero")
    .eq("tipo", tipo)
    .eq("conta_id", contaId)
    .in("situacao", ["aberto", "vencido", "parcial"])
    .gt("saldo", 0)
    .order("previsao")
    .limit(1000);
  q = "ids" in filtro ? q.in("id", filtro.ids) : q.gte("previsao", filtro.de).lte("previsao", filtro.ate);
  const { data: titulos } = await q;
  const ids = [...new Set((titulos ?? []).map((t) => t.pessoa_id).filter(Boolean))];
  const { data: pessoas } = ids.length ? await supabase.from("fin_pessoas").select(CAMPOS_PESSOA).in("id", ids) : { data: [] };
  const pessoa = new Map((pessoas ?? []).map((p) => [p.id as string, p]));
  const dataHoje = hoje();

  return (titulos ?? []).map((t) => {
    const p = pessoa.get(t.pessoa_id as string);
    const previsao = (t.previsao ?? t.vencimento) as string;
    const item: ItemLote = {
      id: t.id as string,
      documento: t.documento as string | null,
      vencimento: t.vencimento as string,
      // Pagamento: na data prevista (o banco não aceita data passada: vencido vai para hoje). Cobrança: emissão.
      data: tipo === "pagar" ? (previsao < dataHoje ? dataHoje : previsao) : ((t.data_registro as string) ?? dataHoje),
      valor: Number(t.saldo),
      codigo_barras: t.codigo_barras as string | null,
      nosso_numero: t.nosso_numero as string | null,
      pessoa: p ? (p as unknown as Pessoa) : null,
      fornecedor: p ? ((p.nome_fantasia || p.razao_social) as string) : "",
      previsao,
      forma: null,
      problema: null,
    };
    if (tipo === "pagar") {
      const f = formaDePagamento(item, bancoDaConta);
      if ("erro" in f) item.problema = f.erro;
      else item.forma = f.rotulo;
    } else {
      const faltas = faltasCobranca(item);
      if (faltas.length) item.problema = `Falta no cadastro do cliente: ${faltas.join(", ")}.`;
      else item.forma = "Boleto";
    }
    return item;
  });
}

export const parametrosDe = (p: Record<string, unknown>) => p as unknown as ParametrosCnab & { id: string; conta_id: string; tipo: string; ultimo_nsa: number };
