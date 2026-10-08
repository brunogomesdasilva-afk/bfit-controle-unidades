// Carga inicial dos balancetes da pasta do Power BI (uma pasta por academia, um arquivo por ano: 2025 = ano
// fechado, 2026 = janeiro a julho). Daqui em diante os balancetes entram pela tela Financeiro > Fechamento mensal.
// Uso: npx tsx scripts/importar-balancetes.mts "<pasta Razao>" [mês final do ano corrente, padrão 7]
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { conferirFechamento, lerBalancete } from "../src/lib/balancete";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const raiz = process.argv[2];
const mesFinalAnoCorrente = Number(process.argv[3] ?? 7);
const anoCorrente = 2026;
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const { data: academias } = await db.from("academias").select("id, nome");
const { data: bruno } = await db.from("profiles").select("id").eq("email", "brunogomesdasilva@gmail.com").maybeSingle();

for (const pasta of fs.readdirSync(raiz)) {
  const academia = (academias ?? []).find((a) => sem(a.nome) === sem(pasta));
  if (!academia) {
    console.log(`${pasta}: academia não encontrada`);
    continue;
  }
  for (const arquivo of fs.readdirSync(path.join(raiz, pasta)).filter((n) => /^\d{4}\.xlsx$/.test(n))) {
    const ano = Number(arquivo.slice(0, 4));
    const mesFim = ano === anoCorrente ? mesFinalAnoCorrente : 12;
    const b = fs.readFileSync(path.join(raiz, pasta, arquivo));
    const linhas = await lerBalancete(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
    const f = conferirFechamento(linhas);
    if (Math.abs(f.diferenca) > 0.01) {
      console.log(`${pasta} ${ano}: NÃO FECHA (${f.diferenca})`);
      continue;
    }
    await db.from("balancetes").delete().eq("academia_id", academia.id).eq("ano", ano).eq("mes_inicio", 1).eq("mes_fim", mesFim);
    const { data: novo, error } = await db
      .from("balancetes")
      .insert({ academia_id: academia.id, ano, mes_inicio: 1, mes_fim: mesFim, arquivo_nome: `${pasta}/${arquivo}`, importado_por: bruno?.id ?? null })
      .select("id")
      .single();
    if (error || !novo) {
      console.log(`${pasta} ${ano}: ERRO ${error?.message}`);
      continue;
    }
    const { error: e2 } = await db.from("balancete_linhas").insert(linhas.map((l) => ({ ...l, balancete_id: novo.id })));
    console.log(`${pasta} ${ano} (jan a ${mesFim}): ${e2 ? "ERRO " + e2.message : `${linhas.length} contas, lucro ${f.resultado.toFixed(2)}`}`);
  }
}
