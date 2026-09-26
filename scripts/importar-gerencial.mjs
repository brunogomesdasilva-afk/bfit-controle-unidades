// Importa a aba de dados do "Gerencial <Academia>.xlsx" para o Controle diário (tabela controle_diario).
// Uso (na pasta do projeto): node scripts/importar-gerencial.mjs "<arquivo.xlsx>" "<nome da academia no sistema>" [--gravar]
// Sem --gravar só confere (simulação). Com --gravar, grava; dias que já existem no sistema são atualizados.
import fs from "node:fs";
import { createRequire } from "node:module";

const raiz = "C:/Users/bruno/Meu Drive/Trabalho/SmartSolution/Claude-CODE/bfit-controle-unidades";
const require = createRequire(raiz + "/package.json");
const ExcelJS = require("exceljs");
const { createClient } = require("@supabase/supabase-js");

const [arquivo, nomeAcademia, modo] = process.argv.slice(2);
const gravar = modo === "--gravar";

const env = Object.fromEntries(
  fs.readFileSync(raiz + "/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
function valor(v) {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return v.result;
    if (v.richText) return v.richText.map((t) => t.text).join("");
  }
  return v;
}

// Colunas do sistema e os nomes possíveis do cabeçalho na planilha.
const CAMPOS = {
  ativos_pagantes: { cab: ["ativos pag."], inteiro: true },
  visitas: { cab: ["visitas"], inteiro: true },
  vendas: { cab: ["vendas"], inteiro: true },
  inadimplentes: { cab: ["inadimplentes"], inteiro: true },
  faturamento: { cab: ["fat", "faturamento"], inteiro: false },
  cancelamentos_solicitados: { cab: ["canc. solic", "canc. solic."], inteiro: true },
  cancelamentos_efetivados: { cab: ["can. efet.", "canc. efet.", "canc. efet"], inteiro: true },
  nps: { cab: ["nps"], inteiro: false },
  neoassist: { cab: ["neoassist", "neo assist"], inteiro: true },
  vendas_site: { cab: ["vendas site"], inteiro: true },
};

const problemas = [];
function numero(bruto, campo, linha, inteiro) {
  let v = valor(bruto);
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim().replace(/^R\$\s*/, "");
    if (s === "" || s === "-") return null;
    const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    if (!Number.isFinite(n)) {
      problemas.push(`linha ${linha}: ${campo} = "${v}" não é número (ficou vazio)`);
      return null;
    }
    v = n;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) {
    problemas.push(`linha ${linha}: ${campo} com valor estranho ${JSON.stringify(v)} (ficou vazio)`);
    return null;
  }
  if (v < 0 && campo !== "nps") {
    problemas.push(`linha ${linha}: ${campo} negativo (${v}) (ficou vazio)`);
    return null;
  }
  return inteiro ? Math.round(v) : Math.round(v * 100) / 100;
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(arquivo);
const aba = wb.worksheets[1];
const cab = new Map();
aba.getRow(1).eachCell({ includeEmpty: false }, (c, i) => cab.set(normalizar(valor(c.value)), i));
const colData = cab.get("dia do mes");
if (!colData) throw new Error(`Aba "${aba.name}": não achei a coluna "Dia do mês"`);
const colunas = Object.fromEntries(
  Object.entries(CAMPOS).map(([campo, def]) => [campo, def.cab.map((c) => cab.get(c)).find(Boolean)])
);
const faltando = Object.entries(colunas).filter(([, i]) => !i).map(([c]) => c);

const porData = new Map();
let semDados = 0;
aba.eachRow((row, r) => {
  if (r === 1) return;
  const bruto = valor(row.getCell(colData).value);
  if (!(bruto instanceof Date)) return;
  const data = bruto.toISOString().slice(0, 10);
  const registro = { data };
  for (const [campo, col] of Object.entries(colunas)) {
    if (!col) continue;
    registro[campo] = numero(row.getCell(col).value, campo, r, CAMPOS[campo].inteiro);
  }
  const vazio = Object.keys(CAMPOS).every((c) => registro[c] === null || registro[c] === undefined);
  if (vazio) { semDados++; return; }
  if (porData.has(data)) problemas.push(`data ${data} repetida (linha ${r}): ficou a última`);
  porData.set(data, registro);
});

const registros = [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
const { data: academia } = await admin.from("academias").select("id, nome").ilike("nome", nomeAcademia).single();
if (!academia) throw new Error(`Academia "${nomeAcademia}" não encontrada no sistema`);
const { data: existentes } = await admin.from("controle_diario").select("data").eq("academia_id", academia.id);
const jaExiste = new Set((existentes ?? []).map((e) => e.data));
const sobrepostos = registros.filter((r) => jaExiste.has(r.data)).map((r) => r.data);

console.log(`Aba: "${aba.name}" · Academia no sistema: ${academia.nome}`);
console.log(`Dias com dados: ${registros.length} (de ${registros[0]?.data} a ${registros.at(-1)?.data}) · linhas só com data (ignoradas): ${semDados}`);
console.log(`Colunas não encontradas na planilha: ${faltando.join(", ") || "nenhuma"}`);
console.log(`Já existem no sistema: ${jaExiste.size} dias · coincidem com a planilha: ${sobrepostos.length} ${sobrepostos.length ? "(" + sobrepostos.slice(0, 10).join(", ") + (sobrepostos.length > 10 ? "…" : "") + ")" : ""}`);
console.log(`Valores ajustados/descartados: ${problemas.length}`);
for (const p of problemas.slice(0, 25)) console.log("  - " + p);
if (problemas.length > 25) console.log(`  … e mais ${problemas.length - 25}`);
console.log("Amostra:", JSON.stringify(registros.slice(-2)));

if (gravar) {
  let gravados = 0;
  for (let i = 0; i < registros.length; i += 500) {
    const lote = registros.slice(i, i + 500).map((r) => ({ ...r, academia_id: academia.id }));
    const { error } = await admin.from("controle_diario").upsert(lote, { onConflict: "academia_id,data" });
    if (error) throw new Error(`Erro ao gravar a partir de ${lote[0].data}: ${error.message}`);
    gravados += lote.length;
  }
  const { count } = await admin.from("controle_diario").select("id", { count: "exact", head: true }).eq("academia_id", academia.id);
  console.log(`GRAVADO: ${gravados} dias enviados · total da ${academia.nome} no sistema agora: ${count}`);
} else {
  console.log("(simulação: nada foi gravado)");
}
