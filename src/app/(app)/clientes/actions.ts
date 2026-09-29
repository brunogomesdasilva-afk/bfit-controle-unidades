"use server";

import { refresh, revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth";
import { lerClientes } from "@/lib/clientes";
import { createClient } from "@/lib/supabase/server";
import type { ResultadoImportacao } from "../frequencia/importar";

const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

// Importa o Excel de clientes (uma aba por unidade, com o nome da academia). Para cada unidade do arquivo,
// os clientes existentes são apagados e ficam os da última importação. Só o administrador importa.
export async function importarClientes(arquivo: { caminho: string; nome: string }): Promise<ResultadoImportacao> {
  const atual = await getPerfilAtual();
  if (atual?.perfil !== "admin") return { erro: "Só o administrador pode importar clientes." };
  const supabase = await createClient();
  if (!arquivo.caminho.startsWith(`${atual.id}/`)) return { erro: "Arquivo inválido. Escolha o Excel de novo." };

  try {
    const { data: conteudo, error: erroDownload } = await supabase.storage.from("importacoes").download(arquivo.caminho);
    if (erroDownload || !conteudo) return { erro: "Não foi possível receber o arquivo. Tente importar de novo." };
    const abas = await lerClientes(Buffer.from(await conteudo.arrayBuffer()));
    if (!abas.length) return { erro: "Nenhuma aba com a coluna IDCLIENTE foi encontrada. Confira se é o Excel de clientes." };

    const { data: academias } = await supabase.from("academias").select("id, nome");
    const resumo: string[] = [];
    const ignoradas: string[] = [];
    for (const aba of abas) {
      const academia = (academias ?? []).find((a) => chave(a.nome) === chave(aba.aba));
      if (!academia) {
        ignoradas.push(aba.aba);
        continue;
      }
      // Substitui os clientes da unidade pelos do arquivo.
      const { error: erroApagar } = await supabase.from("clientes").delete().eq("academia_id", academia.id);
      if (erroApagar) return { erro: `${academia.nome}: não foi possível apagar os clientes anteriores (${erroApagar.message}).` };
      const agora = new Date().toISOString();
      for (let i = 0; i < aba.clientes.length; i += 1000) {
        const lote = aba.clientes.slice(i, i + 1000).map((c) => ({ ...c, academia_id: academia.id, importado_em: agora }));
        const { error } = await supabase.from("clientes").insert(lote);
        if (error) return { erro: `${academia.nome}: erro ao gravar (${error.message}). Importe o arquivo de novo.` };
      }
      const ativos = aba.clientes.filter((c) => (c.status ?? "").toLowerCase() === "ativo").length;
      resumo.push(`${academia.nome}: ${aba.clientes.length.toLocaleString("pt-BR")} clientes (${ativos.toLocaleString("pt-BR")} ativos)`);
    }
    revalidatePath("/", "layout");
    refresh();
    return {
      ok: `${arquivo.nome} importado. ${resumo.join(" · ")}.${ignoradas.length ? ` Abas sem academia com esse nome (ignoradas): ${ignoradas.join(", ")}.` : ""}`,
    };
  } finally {
    await supabase.storage.from("importacoes").remove([arquivo.caminho]);
  }
}
