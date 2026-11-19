import { exigirModulo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ParametrosCnab, type ContaCnab } from "./ParametrosCnab";

// Financeiro > Cadastros > Parâmetros CNAB: por conta corrente, os dados do convênio com o banco para gerar os
// arquivos de remessa (Relatórios > Gerar lote para o banco). Pagar = CNAB 240 de pagamentos a fornecedores;
// receber = CNAB 400 de cobrança (registro de boletos). Conta sem parâmetros vem pré-preenchida com os dados da
// conta e da academia.

const CODIGO_BANCO: [RegExp, string][] = [
  [/bradesco/i, "237"],
  [/ita[uú]/i, "341"],
  [/caixa/i, "104"],
  [/santander/i, "033"],
  [/brasil/i, "001"],
  [/inter/i, "077"],
  [/sicoob/i, "756"],
];
const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
// "0054421-3" → conta 0054421, dígito 3.
const separarDv = (s: string | null) => (s?.includes("-") ? [digitos(s.split("-")[0]), s.split("-").pop()!.trim().slice(0, 1)] : [digitos(s), ""]);

export default async function ParametrosCnabPage() {
  await exigirModulo("financeiro");
  const supabase = await createClient();
  const [{ data: contas }, { data: parametros }] = await Promise.all([
    supabase.from("fin_contas").select("id, nome, banco, agencia, conta, academia_id, academias(nome, cnpj)").eq("tipo", "Corrente").eq("ativa", true).order("nome"),
    supabase.from("fin_cnab_parametros").select("*"),
  ]);

  const lista: ContaCnab[] = (contas ?? []).map((c) => {
    const academia = c.academias as unknown as { nome: string; cnpj: string | null } | null;
    const banco = CODIGO_BANCO.find(([re]) => re.test(c.banco ?? ""))?.[1] ?? digitos(c.banco).slice(0, 3);
    const [agencia, agenciaDv] = separarDv(c.agencia as string | null);
    const [conta, contaDv] = separarDv(c.conta as string | null);
    // Valores iniciais de uma conta ainda sem parâmetros.
    const padrao: Record<string, string> = {
      banco,
      agencia,
      agencia_dv: agenciaDv,
      conta,
      conta_dv: contaDv,
      razao_social: academia?.nome ?? "",
      cnpj: academia?.cnpj ?? "",
      cidade: "OSASCO",
      uf: "SP",
      versao_arquivo: "089",
      versao_lote_credito: "045",
      versao_lote_boleto: "040",
      versao_lote_tributo: "012",
      finalidade_ted: "00005",
      carteira: "09",
      proximo_nosso_numero: "1",
      multa_percentual: "0",
      juros_dia_percentual: "0",
      dias_protesto: "0",
      ultimo_nsa: "0",
    };
    const doTipo = (tipo: "pagar" | "receber") => {
      const p = (parametros ?? []).find((x) => x.conta_id === c.id && x.tipo === tipo);
      return {
        salvo: Boolean(p),
        dados: p ? Object.fromEntries(Object.keys(padrao).concat(["convenio", "codigo_empresa", "logradouro", "numero", "complemento", "cep"]).map((k) => [k, p[k] === null || p[k] === undefined ? "" : String(p[k])])) : padrao,
      };
    };
    return { id: c.id as string, nome: c.nome as string, academia: academia?.nome ?? "", pagar: doTipo("pagar"), receber: doTipo("receber") };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Parâmetros CNAB</h1>
        <p className="text-sm text-slate-500">
          Dados do convênio com o banco para gerar os arquivos de remessa em Relatórios → Gerar lote para o banco. <strong>Pagamentos</strong>: CNAB 240
          (crédito em conta, TED, PIX, boletos e guias). <strong>Cobrança</strong>: CNAB 400 do Bradesco (registro de boletos do contas a receber). O banco
          informa o convênio e confirma as versões de layout; antes do uso real, ele valida um arquivo de teste.
        </p>
      </div>
      <ParametrosCnab contas={lista} />
    </div>
  );
}
