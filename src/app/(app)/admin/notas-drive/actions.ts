"use server";

import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth";
import { idDaPasta, nomeDaPasta } from "@/lib/googleDrive";
import { caminhoLocal, lancarNotaPendente, processarNotasDrive, type Complementos, type ResultadoNota } from "@/lib/nfDrive";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function soAdmin() {
  const atual = await getPerfilAtual();
  return atual?.perfil === "admin" ? atual : null;
}

// Grava as duas pastas, conferindo antes se o sistema consegue abrir cada uma no Drive.
export async function salvarPastas(dados: { notas: string; contabilidade: string; ativo: boolean }): Promise<{ erro?: string; ok?: string }> {
  const atual = await soAdmin();
  if (!atual) return { erro: "Só o administrador altera esta configuração." };
  const locais = [dados.notas, dados.contabilidade].filter((c) => caminhoLocal(c)).length;
  if (locais === 1) return { erro: "As duas pastas precisam ser do mesmo lugar: as duas do computador ou as duas do Google Drive." };
  // Pastas do computador: o servidor não consegue abri-las para conferir; quem confere é o atalho no computador.
  if (locais === 2) {
    if (dados.notas.trim().toLowerCase() === dados.contabilidade.trim().toLowerCase()) return { erro: "As duas pastas precisam ser diferentes." };
    const supabase = await createClient();
    const { error } = await supabase.from("nf_drive_config").upsert({
      id: true,
      pasta_notas: dados.notas.trim(),
      pasta_contabilidade: dados.contabilidade.trim(),
      ativo: dados.ativo,
      atualizado_em: new Date().toISOString(),
      atualizado_por: atual.id,
    });
    if (error) return { erro: error.message };
    revalidatePath("/admin/notas-drive");
    return { ok: "Pastas do computador gravadas. O Rodar agora funciona com o sistema aberto no computador (iniciar-sistema.bat)." };
  }
  const nomes: string[] = [];
  for (const [rotulo, link] of [
    ["notas fiscais", dados.notas],
    ["fechamento da contabilidade", dados.contabilidade],
  ] as const) {
    const id = idDaPasta(link);
    if (!id) return { erro: `Cole o link da pasta de ${rotulo} (Google Drive → botão direito na pasta → Compartilhar → Copiar link).` };
    try {
      nomes.push(await nomeDaPasta(id));
    } catch (e) {
      return { erro: `Pasta de ${rotulo}: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  if (idDaPasta(dados.notas) === idDaPasta(dados.contabilidade)) return { erro: "As duas pastas precisam ser diferentes." };
  const supabase = await createClient();
  const { error } = await supabase.from("nf_drive_config").upsert({
    id: true,
    pasta_notas: dados.notas.trim(),
    pasta_contabilidade: dados.contabilidade.trim(),
    ativo: dados.ativo,
    atualizado_em: new Date().toISOString(),
    atualizado_por: atual.id,
  });
  if (error) return { erro: error.message };
  revalidatePath("/admin/notas-drive");
  return { ok: `Pastas gravadas: "${nomes[0]}" e "${nomes[1]}".` };
}

// "Rodar agora": lê todas as notas da pasta (o resultado aparece na tela).
export async function rodarAgora(): Promise<{ erro?: string; aviso?: string | null; resultados?: ResultadoNota[]; restantes?: number }> {
  if (!(await soAdmin())) return { erro: "Só o administrador roda o robô." };
  const db = createAdminClient();
  if (!db) return { erro: "Chave de serviço não configurada." };
  try {
    const r = await processarNotasDrive(db);
    revalidatePath("/admin/notas-drive");
    return r;
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}

// "Lançar" de uma nota pendente, com a categoria e/ou o vencimento informados na tela.
export async function lancarPendente(arquivoId: string, complementos: Complementos): Promise<{ erro?: string; ok?: string }> {
  if (!(await soAdmin())) return { erro: "Só o administrador lança as notas." };
  if (complementos.vencimento && !/^\d{4}-\d{2}-\d{2}$/.test(complementos.vencimento)) return { erro: "Vencimento inválido." };
  const db = createAdminClient();
  if (!db) return { erro: "Chave de serviço não configurada." };
  try {
    const r = await lancarNotaPendente(db, arquivoId, complementos);
    revalidatePath("/admin/notas-drive");
    if ("aviso" in r) return { erro: r.aviso };
    if (r.situacao === "lancada" || r.situacao === "ja_lancada") return { ok: `Lançada no contas a pagar e levada para ${r.destino}.` };
    return { erro: r.motivo ?? "Não foi possível lançar a nota." };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}
