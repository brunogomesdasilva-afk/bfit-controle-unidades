"use server";

import { revalidatePath } from "next/cache";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Parâmetros CNAB de uma conta corrente (pagamentos ou cobrança).
const TEXTOS = ["banco", "agencia", "agencia_dv", "conta", "conta_dv", "convenio", "codigo_empresa", "razao_social", "cnpj", "logradouro", "numero", "complemento", "cidade", "cep", "uf", "versao_arquivo", "versao_lote_credito", "versao_lote_boleto", "versao_lote_tributo", "finalidade_ted", "carteira"] as const;
const NUMEROS = ["proximo_nosso_numero", "multa_percentual", "juros_dia_percentual", "dias_protesto", "ultimo_nsa"] as const;
const SO_DIGITOS = new Set(["banco", "agencia", "conta", "cnpj", "cep", "codigo_empresa", "versao_arquivo", "versao_lote_credito", "versao_lote_boleto", "versao_lote_tributo", "finalidade_ted", "carteira"]);

export async function salvarParametrosCnab(contaId: string, tipo: "pagar" | "receber", dados: Record<string, string>): Promise<{ erro?: string; ok?: string }> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "financeiro")) return { erro: "Você não tem o módulo Financeiro." };
  if (!["pagar", "receber"].includes(tipo)) return { erro: "Tipo inválido." };
  const registro: Record<string, string | number | null> = { conta_id: contaId, tipo, layout: tipo === "pagar" ? "240" : "400", atualizado_em: new Date().toISOString(), atualizado_por: atual.id };
  for (const c of TEXTOS) {
    const v = (dados[c] ?? "").trim();
    registro[c] = (SO_DIGITOS.has(c) ? v.replace(/\D/g, "") : v.toLocaleUpperCase("pt-BR")) || null;
  }
  for (const c of NUMEROS) {
    const v = Number((dados[c] ?? "0").replace(",", "."));
    if (!Number.isFinite(v) || v < 0) return { erro: `Valor inválido em ${c}.` };
    registro[c] = v;
  }
  if (!registro.banco || String(registro.banco).length !== 3) return { erro: "Informe o código do banco com 3 dígitos (ex.: 237 Bradesco)." };
  for (const c of ["versao_arquivo", "versao_lote_credito", "versao_lote_boleto", "versao_lote_tributo", "finalidade_ted", "carteira"] as const) if (!registro[c]) delete registro[c];
  const supabase = await createClient();
  const { error } = await supabase.from("fin_cnab_parametros").upsert(registro, { onConflict: "conta_id,tipo" });
  if (error) return { erro: error.message };
  revalidatePath("/financeiro/cadastros/cnab");
  return { ok: `Parâmetros de ${tipo === "pagar" ? "pagamentos" : "cobrança"} gravados.` };
}
