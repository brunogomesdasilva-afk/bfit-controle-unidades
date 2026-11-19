"use server";

import { revalidatePath } from "next/cache";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { faltasNosParametros, formaDePagamento, remessaCobranca400, remessaPagamentos240 } from "@/lib/cnab";
import { parametrosDe, titulosParaLote } from "@/lib/loteBanco";
import { createClient } from "@/lib/supabase/server";

type Resultado = { erro?: string; ok?: string; arquivo?: { nome: string; conteudo: string } };

// Gera o arquivo de remessa com os títulos escolhidos, guarda no histórico e avança o número do arquivo (NSA) e,
// na cobrança, o nosso número de cada boleto novo.
export async function gerarLoteBanco(tipo: "pagar" | "receber", contaId: string, ids: string[]): Promise<Resultado> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "financeiro")) return { erro: "Você não tem o módulo Financeiro." };
  if (!ids.length) return { erro: "Selecione os títulos do lote." };
  const supabase = await createClient();
  const { data: bruto } = await supabase.from("fin_cnab_parametros").select("*").eq("conta_id", contaId).eq("tipo", tipo).maybeSingle();
  if (!bruto) return { erro: "Esta conta não tem parâmetros CNAB. Configure em Cadastros → Parâmetros CNAB." };
  const p = parametrosDe(bruto);
  const faltas = faltasNosParametros(p, tipo);
  if (faltas.length) return { erro: `Complete os parâmetros CNAB da conta: ${faltas.join(", ")}.` };

  const itens = await titulosParaLote(supabase, tipo, contaId, p.banco, { ids });
  if (itens.length !== ids.length) return { erro: "Algum título não está mais em aberto nesta conta. Atualize a tela." };
  const comProblema = itens.filter((i) => i.problema);
  if (comProblema.length) return { erro: `${comProblema.length} título(s) com pendência: ${comProblema.map((i) => `${i.fornecedor} (${i.problema})`).join("; ")}` };

  const nsa = Number(p.ultimo_nsa) + 1;
  const agora = new Date();
  const ddmm = new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(5, 10).split("-").reverse().join("");
  let conteudo: string;
  let proximoNossoNumero = Number(p.proximo_nosso_numero);
  const nossosNumeros: { id: string; nosso: string }[] = [];
  if (tipo === "pagar") {
    conteudo = remessaPagamentos240(
      p,
      nsa,
      agora,
      itens.map((i) => {
        const f = formaDePagamento(i, p.banco);
        if ("erro" in f) throw new Error(f.erro);
        return { titulo: i, forma: f.forma };
      })
    );
  } else {
    // Boleto já registrado mantém o nosso número; os novos recebem o próximo da sequência.
    const comNumero = itens.map((i) => {
      const nosso = i.nosso_numero ?? String(proximoNossoNumero++);
      if (!i.nosso_numero) nossosNumeros.push({ id: i.id, nosso });
      return { ...i, nossoNumero: nosso };
    });
    conteudo = remessaCobranca400(p, nsa, agora, comNumero);
  }
  const nome = `${tipo === "pagar" ? "PG" : "CB"}${ddmm}${String(nsa % 100).padStart(2, "0")}.REM`;
  const total = itens.reduce((s, i) => s + i.valor, 0);

  const { error } = await supabase.from("fin_cnab_lotes").insert({ tipo, conta_id: contaId, nsa, arquivo_nome: nome, conteudo, quantidade: itens.length, total, titulos: ids, criado_por: atual.id });
  if (error) return { erro: error.message };
  await supabase.from("fin_cnab_parametros").update({ ultimo_nsa: nsa, proximo_nosso_numero: proximoNossoNumero }).eq("id", p.id);
  for (const n of nossosNumeros) await supabase.from("fin_titulos").update({ nosso_numero: n.nosso }).eq("id", n.id);
  revalidatePath("/financeiro/lote-banco");
  return { ok: `Arquivo ${nome} gerado com ${itens.length} título(s).`, arquivo: { nome, conteudo } };
}

// Baixa de novo um arquivo do histórico.
export async function arquivoDoLote(id: string): Promise<Resultado> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "financeiro")) return { erro: "Você não tem o módulo Financeiro." };
  const { data } = await (await createClient()).from("fin_cnab_lotes").select("arquivo_nome, conteudo").eq("id", id).maybeSingle();
  return data ? { arquivo: { nome: data.arquivo_nome as string, conteudo: data.conteudo as string } } : { erro: "Arquivo não encontrado." };
}
