"use server";

import { refresh } from "next/cache";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { conferirFechamento, lerBalancete } from "@/lib/balancete";
import { rotuloPeriodo } from "@/lib/nomeBalancete";
import { createClient } from "@/lib/supabase/server";

export type ResultadoImportacao = { erro?: string; ok?: string; aviso?: string };

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Importa o balancete de uma academia e período (o mesmo período importado de novo substitui o anterior).
// Recusa balancete que não fecha (ativo ≠ passivo + resultado) e período que se sobrepõe a outro já importado;
// avisa quando o saldo inicial não bate com o saldo final do período anterior.
export async function importarBalancete(formData: FormData): Promise<ResultadoImportacao> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "financeiro")) return { erro: "Só quem tem o módulo Financeiro importa balancetes." };
  const arquivo = formData.get("arquivo");
  const academiaId = String(formData.get("academia") ?? "");
  const ano = Number(formData.get("ano"));
  const mesInicio = Number(formData.get("mes_inicio"));
  const mesFim = Number(formData.get("mes_fim"));
  if (!(arquivo instanceof File) || !arquivo.size) return { erro: "Escolha o arquivo do balancete." };
  if (!/\.xlsx?$/i.test(arquivo.name)) return { erro: `${arquivo.name}: envie o balancete em Excel (.xlsx).` };
  if (!academiaId) return { erro: `${arquivo.name}: escolha a academia.` };
  if (!(ano >= 2000 && ano <= 2100)) return { erro: `${arquivo.name}: informe o ano.` };
  if (!(mesInicio >= 1 && mesFim <= 12 && mesFim >= mesInicio)) return { erro: `${arquivo.name}: informe o mês (ou os meses) do balancete.` };

  let linhas;
  try {
    linhas = await lerBalancete(await arquivo.arrayBuffer());
  } catch (e) {
    return { erro: `${arquivo.name}: ${e instanceof Error ? e.message : String(e)}` };
  }
  const fechamento = conferirFechamento(linhas);
  if (Math.abs(fechamento.diferenca) > 0.01)
    return { erro: `${arquivo.name}: o balancete não fecha (ativo ${reais(fechamento.ativo)} ≠ passivo ${reais(fechamento.passivo)} + resultado; diferença ${reais(fechamento.diferenca)}). Peça à contabilidade o arquivo completo.` };

  const supabase = await createClient();
  const { data: academia } = await supabase.from("academias").select("id, nome").eq("id", academiaId).maybeSingle();
  if (!academia) return { erro: "Academia não encontrada." };
  const periodo = rotuloPeriodo(mesInicio, mesFim, ano);

  const { data: doAno } = await supabase.from("balancetes").select("id, mes_inicio, mes_fim").eq("academia_id", academiaId).eq("ano", ano);
  const mesmo = (doAno ?? []).find((b) => b.mes_inicio === mesInicio && b.mes_fim === mesFim);
  const sobreposto = (doAno ?? []).find((b) => b !== mesmo && b.mes_inicio <= mesFim && b.mes_fim >= mesInicio);
  if (sobreposto)
    return { erro: `${academia.nome}: já existe o balancete de ${rotuloPeriodo(sobreposto.mes_inicio, sobreposto.mes_fim, ano)}, que inclui ${periodo}. Exclua o outro antes, se quiser trocar.` };

  // Continuidade: o saldo inicial do ativo deve ser o saldo final do período anterior (mesmo ano ou dezembro do ano anterior).
  let aviso: string | undefined;
  const anterior =
    mesInicio > 1
      ? (doAno ?? []).filter((b) => b.mes_fim < mesInicio).sort((a, b) => b.mes_fim - a.mes_fim)[0]
      : ((await supabase.from("balancetes").select("id, mes_inicio, mes_fim").eq("academia_id", academiaId).eq("ano", ano - 1).eq("mes_fim", 12).maybeSingle()).data ?? undefined);
  if (anterior) {
    const { data: ativoAnterior } = await supabase.from("balancete_linhas").select("saldo_atual").eq("balancete_id", anterior.id).eq("conta", "1").maybeSingle();
    const inicial = linhas.find((l) => l.conta === "1")?.saldo_anterior ?? 0;
    if (ativoAnterior && Math.abs(Number(ativoAnterior.saldo_atual) - inicial) > 0.01)
      aviso = `Atenção: o ativo inicial deste balancete (${reais(inicial)}) não bate com o ativo final do período anterior (${reais(Number(ativoAnterior.saldo_atual))}). A contabilidade pode ter refeito lançamentos do período anterior: reimporte-o.`;
  } else if (mesInicio > 1) aviso = `Falta o balancete dos meses anteriores a ${periodo} deste ano: o acumulado do ano fica incompleto até ele ser importado.`;

  if (mesmo) {
    const { error } = await supabase.from("balancetes").delete().eq("id", mesmo.id);
    if (error) return { erro: `Não foi possível substituir o balancete anterior: ${error.message}` };
  }
  const { data: novo, error: erroNovo } = await supabase
    .from("balancetes")
    .insert({ academia_id: academiaId, ano, mes_inicio: mesInicio, mes_fim: mesFim, arquivo_nome: arquivo.name, importado_por: atual.id })
    .select("id")
    .single();
  if (erroNovo || !novo) return { erro: `Não foi possível gravar o balancete: ${erroNovo?.message ?? ""}` };
  const { error: erroLinhas } = await supabase.from("balancete_linhas").insert(linhas.map((l) => ({ ...l, balancete_id: novo.id })));
  if (erroLinhas) {
    await supabase.from("balancetes").delete().eq("id", novo.id);
    return { erro: `Não foi possível gravar as linhas do balancete: ${erroLinhas.message}` };
  }
  refresh();
  return { ok: `${academia.nome} · ${periodo}: ${linhas.length} contas importadas${mesmo ? " (substituiu o anterior)" : ""}. Lucro do período ${reais(fechamento.resultado)}.`, aviso };
}

export async function excluirBalancete(id: string): Promise<ResultadoImportacao> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "financeiro")) return { erro: "Só quem tem o módulo Financeiro exclui balancetes." };
  const supabase = await createClient();
  const { error } = await supabase.from("balancetes").delete().eq("id", id);
  if (error) return { erro: error.message };
  refresh();
  return { ok: "Balancete excluído." };
}
