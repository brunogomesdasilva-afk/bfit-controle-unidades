// Importação em massa dos relatórios de passagens (catraca) e do Gympass com uma aba por unidade
// (o nome da aba é o nome da academia no sistema). Linhas que já estão no sistema são ignoradas.
// Uso: npx tsx scripts/importar-relatorios.ts passagens|gympass "<arquivo.xlsx>" [--gravar]
import { readFileSync } from "fs";
import { basename } from "path";
import { createClient } from "@supabase/supabase-js";
import { lerAbas, type TipoRelatorio } from "../src/lib/importacao";

const [tipo, arquivo, ...opcoes] = process.argv.slice(2) as [TipoRelatorio, string, ...string[]];
const gravar = opcoes.includes("--gravar");
const SEM_REPETICAO = { passagens: "academia_id,data,hora,cliente_id,entrada_por", gympass: "academia_id,data,hora,wellhub_id" };
const chave = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  if (tipo !== "passagens" && tipo !== "gympass") throw new Error("Tipo deve ser passagens ou gympass.");
  const { data: academias } = await supabase.from("academias").select("id, nome");
  const { data: admin } = await supabase.from("profiles").select("id").eq("perfil", "admin").order("created_at").limit(1).maybeSingle();
  const abas = await lerAbas(tipo, readFileSync(arquivo));
  for (const aba of abas) {
    const academia = (academias ?? []).find((a) => chave(a.nome) === chave(aba.aba));
    const datas = aba.linhas.map((l) => l.data).sort();
    console.log(`Aba "${aba.aba}" → ${academia?.nome ?? "ACADEMIA NÃO ENCONTRADA"}: ${aba.linhas.length} linhas (${datas[0]} a ${datas.at(-1)})`);
    if (!academia || !gravar || aba.linhas.length === 0) continue;

    const { data: importacao, error } = await supabase
      .from("importacoes")
      .insert({ academia_id: academia.id, tipo, arquivo: `${basename(arquivo)} (aba ${aba.aba})`, linhas_lidas: aba.linhas.length, criado_por: admin?.id ?? null })
      .select("id")
      .single();
    if (error || !importacao) throw new Error(error?.message);
    let novas = 0;
    for (let i = 0; i < aba.linhas.length; i += 1000) {
      const lote = aba.linhas.slice(i, i + 1000).map((l) => ({ ...l, academia_id: academia.id, importacao_id: importacao.id }));
      const { data, error: e } = await supabase.from(tipo).upsert(lote, { onConflict: SEM_REPETICAO[tipo], ignoreDuplicates: true }).select("id");
      if (e) {
        await supabase.from("importacoes").delete().eq("id", importacao.id);
        throw new Error(`${aba.aba}: ${e.message} (nada desta aba ficou gravado)`);
      }
      novas += data?.length ?? 0;
    }
    await supabase.from("importacoes").update({ linhas_novas: novas }).eq("id", importacao.id);
    console.log(`  GRAVADO: ${novas} novas, ${aba.linhas.length - novas} repetidas`);
  }
  if (!gravar) console.log("(simulação: nada foi gravado)");
})();
