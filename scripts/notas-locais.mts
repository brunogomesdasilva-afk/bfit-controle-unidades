// Robô das notas fiscais com pastas do COMPUTADOR (Administrador > Notas do Drive, com caminhos como C:\Users\...):
// o sistema na internet não enxerga o disco local, então este atalho faz no computador o mesmo que o botão "Rodar
// agora" faz com o Google Drive: lê cada PDF da pasta de notas, lança no contas a pagar e move a nota renomeada para a
// pasta da contabilidade (ano / mês da emissão / academia). Usa as chaves do .env.local.
// Uso: npx tsx scripts/notas-locais.mts   (ou dois cliques em rodar-notas-do-computador.bat)
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Chaves do .env.local também para as bibliotecas (leitura da nota pelo Claude, e-mail de resumo).
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  if (!l.includes("=") || l.startsWith("#")) continue;
  const chave = l.slice(0, l.indexOf("=")).trim();
  process.env[chave] ??= l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
}
const { processarNotasDrive } = await import("../src/lib/nfDrive");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

console.log("Lendo a pasta de notas fiscais…");
const r = await processarNotasDrive(db, { avisar: true });
if (r.aviso) console.log(r.aviso);
const nomes = { lancada: "LANÇADA", ja_lancada: "JÁ LANÇADA", pendente: "PENDENTE", erro: "ERRO" };
for (const x of r.resultados) console.log(`${nomes[x.situacao]}: ${x.arquivo}${x.destino ? ` → ${x.destino}` : x.motivo ? ` (${x.motivo})` : ""}`);
console.log(r.resultados.length ? `${r.resultados.length} notas lidas.` : "Nenhuma nota na pasta.");
if (r.restantes) console.log(`${r.restantes} notas ficaram para a próxima vez (tempo esgotado).`);
