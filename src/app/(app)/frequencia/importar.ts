"use server";

import { refresh, revalidatePath } from "next/cache";
import { lerRelatorio, type TipoRelatorio } from "@/lib/importacao";
import { lerContagemSala } from "@/lib/importarSala";
import { hoje, mensagemErro, verificarAcesso } from "@/lib/planilha";
import { createClient } from "@/lib/supabase/server";

export type ResultadoImportacao = { erro?: string; ok?: string };

const LOTE = 1000;
const PASTA = "importacoes";

// Chave que identifica uma linha repetida (mesma pessoa, mesmo horário) em cada relatório.
const SEM_REPETICAO: Record<TipoRelatorio, string> = {
  passagens: "academia_id,data,hora,cliente_id,entrada_por",
  gympass: "academia_id,data,hora,wellhub_id",
};

// Importa o Excel escolhido pelo usuário para a academia da aba aberta.
// O navegador já enviou o arquivo para a pasta do usuário no armazenamento do Supabase (sem passar pelo
// servidor do site, que tem limite de tamanho); aqui ele é lido, importado e apagado.
// Linhas que já estavam no sistema (arquivo importado de novo) são ignoradas.
export async function importarRelatorio(
  tipo: TipoRelatorio,
  academiaId: string,
  arquivo: { caminho: string; nome: string }
): Promise<ResultadoImportacao> {
  const semAcesso = await verificarAcesso();
  if (semAcesso) return { erro: semAcesso };
  if (!academiaId) return { erro: "Abra a aba da academia antes de importar." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !arquivo.caminho.startsWith(`${user.id}/`)) return { erro: "Arquivo inválido. Escolha o Excel de novo." };

  try {
    return await importarDoArmazenamento(supabase, user.id, tipo, academiaId, arquivo);
  } finally {
    // O Excel só fica guardado durante a importação.
    await supabase.storage.from(PASTA).remove([arquivo.caminho]);
  }
}

async function importarDoArmazenamento(
  supabase: Awaited<ReturnType<typeof createClient>>,
  usuarioId: string,
  tipo: TipoRelatorio,
  academiaId: string,
  arquivo: { caminho: string; nome: string }
): Promise<ResultadoImportacao> {
  const { data: conteudo, error: erroDownload } = await supabase.storage.from(PASTA).download(arquivo.caminho);
  if (erroDownload || !conteudo) return { erro: "Não foi possível receber o arquivo. Tente importar de novo." };

  let lido;
  try {
    lido = await lerRelatorio(tipo, Buffer.from(await conteudo.arrayBuffer()));
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível ler a planilha." };
  }
  if (lido.linhas.length === 0) return { erro: "Nenhuma linha com data e hora foi encontrada na planilha." };


  const { data: importacao, error: erroImportacao } = await supabase
    .from("importacoes")
    .insert({ academia_id: academiaId, tipo, arquivo: arquivo.nome, linhas_lidas: lido.linhas.length, criado_por: usuarioId })
    .select("id")
    .single();
  if (erroImportacao || !importacao) return { erro: mensagemErro(erroImportacao ?? { message: "Erro ao registrar a importação." }) };

  let novas = 0;
  for (let i = 0; i < lido.linhas.length; i += LOTE) {
    const lote = lido.linhas.slice(i, i + LOTE).map((l) => ({ ...l, academia_id: academiaId, importacao_id: importacao.id }));
    const { data, error } = await supabase
      .from(tipo)
      .upsert(lote, { onConflict: SEM_REPETICAO[tipo], ignoreDuplicates: true })
      .select("id");
    if (error) {
      // Desfaz o que entrou desta importação para não ficar pela metade.
      await supabase.from("importacoes").delete().eq("id", importacao.id);
      return { erro: `Erro ao gravar as linhas: ${mensagemErro(error)}. Nada foi importado.` };
    }
    novas += data?.length ?? 0;
  }

  // Um arquivo que não trouxe nada novo não precisa ficar na lista de importações.
  if (novas === 0) await supabase.from("importacoes").delete().eq("id", importacao.id);
  else await supabase.from("importacoes").update({ linhas_novas: novas }).eq("id", importacao.id);

  revalidatePath("/frequencia", "layout");
  refresh();

  const repetidas = lido.linhas.length - novas;
  const partes = [`${novas.toLocaleString("pt-BR")} ${novas === 1 ? "linha importada" : "linhas importadas"}`];
  if (repetidas > 0) partes.push(`${repetidas.toLocaleString("pt-BR")} já estavam no sistema`);
  if (lido.ignoradas > 0) partes.push(`${lido.ignoradas.toLocaleString("pt-BR")} sem data/hora válida foram ignoradas`);
  return { ok: `${arquivo.nome}: ${partes.join(", ")}.` };
}

// Desfaz uma importação: apaga as linhas que vieram daquele arquivo (só o administrador).
export async function desfazerImportacao(id: string): Promise<ResultadoImportacao> {
  const semAcesso = await verificarAcesso(true);
  if (semAcesso) return { erro: semAcesso };

  const supabase = await createClient();
  const { error } = await supabase.from("importacoes").delete().eq("id", id);
  if (error) return { erro: mensagemErro(error) };

  revalidatePath("/frequencia", "layout");
  refresh();
  return { ok: "Importação desfeita." };
}

// Contagem de sala: importa a aba CONTAGEM da planilha operacional para a academia da aba aberta.
// Contagens que já estão no sistema (mesmo dia e horário) não são duplicadas.
export async function importarContagemSala(academiaId: string, arquivo: { caminho: string; nome: string }): Promise<ResultadoImportacao> {
  const semAcesso = await verificarAcesso();
  if (semAcesso) return { erro: semAcesso };
  if (!academiaId) return { erro: "Abra a aba da academia antes de importar." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !arquivo.caminho.startsWith(`${user.id}/`)) return { erro: "Arquivo inválido. Escolha o Excel de novo." };

  try {
    const { data: conteudo, error: erroDownload } = await supabase.storage.from(PASTA).download(arquivo.caminho);
    if (erroDownload || !conteudo) return { erro: "Não foi possível receber o arquivo. Tente importar de novo." };
    let lido;
    try {
      lido = await lerContagemSala(Buffer.from(await conteudo.arrayBuffer()), hoje());
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível ler a planilha." };
    }
    if (!lido.linhas.length) return { erro: `Nenhuma contagem com data e horário foi encontrada na aba "${lido.aba}".` };

    // Contagens que já existem no período da planilha.
    const datas = lido.linhas.map((l) => l.data).sort();
    const existentes = new Set<string>();
    for (let de = 0; ; de += 1000) {
      const { data } = await supabase
        .from("contagem_sala")
        .select("data, horario")
        .eq("academia_id", academiaId)
        .gte("data", datas[0])
        .lte("data", datas.at(-1)!)
        .order("data")
        .range(de, de + 999);
      for (const r of data ?? []) existentes.add(`${r.data}|${String(r.horario).slice(0, 5)}`);
      if (!data || data.length < 1000) break;
    }
    const novas = lido.linhas.filter((l) => !existentes.has(`${l.data}|${l.horario}`));
    for (let i = 0; i < novas.length; i += 1000) {
      const { error } = await supabase
        .from("contagem_sala")
        .insert(novas.slice(i, i + 1000).map((l) => ({ ...l, academia_id: academiaId, criado_por: user.id })));
      if (error) return { erro: `Erro ao gravar (${mensagemErro(error)}). ${i} contagens já tinham sido gravadas; importe de novo para completar.` };
    }

    revalidatePath("/frequencia", "layout");
    refresh();
    const partes = [`${novas.length.toLocaleString("pt-BR")} contagens importadas (${datas[0].split("-").reverse().join("/")} a ${datas.at(-1)!.split("-").reverse().join("/")})`];
    const jaTinha = lido.linhas.length - novas.length;
    if (jaTinha) partes.push(`${jaTinha.toLocaleString("pt-BR")} já estavam no sistema`);
    if (lido.repetidasNaPlanilha) partes.push(`${lido.repetidasNaPlanilha} repetidas na planilha`);
    if (lido.semData) partes.push(`${lido.semData} sem data/horário válido foram ignoradas`);
    if (lido.diasEmSequencia) partes.push(`${lido.diasEmSequencia} dia(s) com a coluna de professores em sequência ficaram sem professores`);
    return { ok: `${arquivo.nome} (aba ${lido.aba}): ${partes.join(", ")}.` };
  } finally {
    await supabase.storage.from(PASTA).remove([arquivo.caminho]);
  }
}
