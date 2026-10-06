"use server";

import { refresh } from "next/cache";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { MANTER, montarBackup, PASTA_BACKUPS } from "@/lib/backup";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResultadoBackup = { erro?: string; ok?: string; url?: string; aviso?: string };

// Faz o backup: coloca o sistema em manutenção (só o administrador acessa e grava), monta o pacote,
// guarda no armazenamento (ficam só os 2 últimos), libera o sistema e devolve o link para baixar.
export async function fazerBackup(): Promise<ResultadoBackup> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "adm")) return { erro: "Só quem tem o módulo ADM pode fazer o backup." };
  const db = createAdminClient();
  if (!db) return { erro: "Chave de serviço do Supabase não configurada no servidor." };

  const { error: erroTrava } = await db
    .from("sistema_estado")
    .update({ manutencao: true, motivo: "Backup em andamento", iniciado_por: atual.id, iniciado_em: new Date().toISOString() })
    .eq("id", 1);
  if (erroTrava) return { erro: `Não foi possível colocar o sistema em manutenção: ${erroTrava.message}` };

  try {
    const pacote = await montarBackup(db);
    const { error: erroEnvio } = await db.storage
      .from(PASTA_BACKUPS)
      .upload(pacote.nome, pacote.conteudo, { contentType: "application/zip", upsert: true });
    if (erroEnvio) return { erro: `Backup montado, mas não foi possível guardar: ${erroEnvio.message}` };

    // Só os 2 últimos ficam guardados (o nome começa pela data e hora, então a ordem alfabética é a do tempo).
    const { data: guardados } = await db.storage.from(PASTA_BACKUPS).list("", { limit: 100 });
    const antigos = (guardados ?? [])
      .map((a) => a.name)
      .filter((n) => n.endsWith(".zip"))
      .sort()
      .reverse()
      .slice(MANTER);
    if (antigos.length) await db.storage.from(PASTA_BACKUPS).remove(antigos);

    const { data: link } = await db.storage.from(PASTA_BACKUPS).createSignedUrl(pacote.nome, 60 * 60, { download: pacote.nome });
    const tamanho = (pacote.conteudo.length / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    return {
      ok: `Backup concluído (${tamanho} MB). O download começou: salve na pasta de backups do Drive.`,
      url: link?.signedUrl,
      aviso: pacote.avisoCodigo ?? undefined,
    };
  } catch (e) {
    return { erro: `Erro ao montar o backup: ${e instanceof Error ? e.message : "erro desconhecido"}. O sistema foi liberado.` };
  } finally {
    await db.from("sistema_estado").update({ manutencao: false, motivo: null }).eq("id", 1);
    refresh();
  }
}

// Libera o sistema se ele ficou em manutenção (ex.: o backup foi interrompido no meio).
export async function liberarSistema(): Promise<ResultadoBackup> {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "adm")) return { erro: "Só quem tem o módulo ADM pode liberar o sistema." };
  const db = createAdminClient();
  if (!db) return { erro: "Chave de serviço do Supabase não configurada no servidor." };
  const { error } = await db.from("sistema_estado").update({ manutencao: false, motivo: null }).eq("id", 1);
  refresh();
  return error ? { erro: error.message } : { ok: "Sistema liberado para todos." };
}
