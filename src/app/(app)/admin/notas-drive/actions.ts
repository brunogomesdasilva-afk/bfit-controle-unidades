"use server";

import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth";
import { idDaPasta, nomeDaPasta } from "@/lib/googleDrive";
import { processarNotasDrive, type ResultadoNota } from "@/lib/nfDrive";
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

// "Rodar agora": a mesma execução das 19h, sem o e-mail (o resultado aparece na tela).
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
