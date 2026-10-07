// Traz para o histórico do sistema (pagamentos_conferencias) os relatórios da conferência de pagamentos feitos
// pela skill validar-pagamentos em Validacao-pagamentos/<Unidade>/<AAAA-MM>/relatorio/*.md, para que o botão
// "Conferir pagamentos" do Financeiro use esse histórico (seção 22). Não duplica: pula o que já foi importado.
// Uso: node scripts/importar-conferencias-pagamentos.mjs
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const RAIZ = "../Validacao-pagamentos";
const PASTAS = { Continental: "continental", KM18: "km18", "Novo Osasco-Conceicao": "novo osasco", Rochdale: "rochdale" };
const sem = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const { data: academias, error } = await db.from("academias").select("id, nome");
if (error) throw error;
const { data: bruno } = await db.from("profiles").select("id").eq("email", "brunogomesdasilva@gmail.com").maybeSingle();

for (const [pasta, chave] of Object.entries(PASTAS)) {
  const academia = academias.find((a) => sem(a.nome).replace(/\s+/g, "").includes(chave.replace(/\s+/g, "")));
  if (!academia) {
    console.log(`${pasta}: academia não encontrada`);
    continue;
  }
  for (const mes of fs.readdirSync(path.join(RAIZ, pasta)).filter((m) => /^\d{4}-\d{2}$/.test(m))) {
    const dirLote = path.join(RAIZ, pasta, mes);
    const dirRel = path.join(dirLote, "relatorio");
    if (!fs.existsSync(dirRel)) continue;
    const arquivos = fs.readdirSync(dirLote).filter((n) => fs.statSync(path.join(dirLote, n)).isFile());
    for (const rel of fs.readdirSync(dirRel).filter((n) => n.endsWith(".md"))) {
      const nome = `${rel} (Claude Code)`;
      const { data: ja } = await db.from("pagamentos_conferencias").select("id").eq("academia_id", academia.id).eq("arquivo_nome", nome).maybeSingle();
      if (ja) {
        console.log(`${pasta} ${mes}: ${rel} já importado`);
        continue;
      }
      const { error: e } = await db.from("pagamentos_conferencias").insert({
        academia_id: academia.id,
        mes,
        status: "conferida",
        arquivo_nome: nome,
        arquivo_caminho: `Validacao-pagamentos/${pasta}/${mes}`,
        inventario: arquivos.map((n) => ({ nome: n, tipo: n.toLowerCase().split(".").pop(), tamanho: fs.statSync(path.join(dirLote, n)).size, lido: true })),
        relatorio: fs.readFileSync(path.join(dirRel, rel), "utf8"),
        modelo: "claude-code (skill validar-pagamentos)",
        criado_por: bruno?.id ?? null,
        criado_em: fs.statSync(path.join(dirRel, rel)).mtime.toISOString(),
      });
      console.log(`${pasta} ${mes}: ${rel} ${e ? "ERRO " + e.message : "importado"}`);
    }
  }
}
