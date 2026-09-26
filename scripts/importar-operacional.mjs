// Importa as 3 primeiras abas da "Planilha Operacional <Academia>.xlsx" para o Controle de frequência:
//   CONTAGEM   → contagem_sala      (data, horário, musculação, cardio, professores)
//   GINASTICA  → contagem_coletivas (data, horário, professor, modalidade, quantidade)
//   LUTAS      → contagem_lutas     (data, horário, professor, modalidade, quantidade)
// Cadastra na academia os professores (Professor de coletivas / de lutas) e as modalidades que faltarem.
// Uso (na pasta do projeto): node scripts/importar-operacional.mjs "<arquivo.xlsx>" "<academia>" [--gravar]
// Sem --gravar só confere (simulação).
import fs from "node:fs";
import { createRequire } from "node:module";

const raiz = "C:/Users/bruno/Meu Drive/Trabalho/SmartSolution/Claude-CODE/bfit-controle-unidades";
const require = createRequire(raiz + "/package.json");
const ExcelJS = require("exceljs");
const { createClient } = require("@supabase/supabase-js");

const [arquivo, nomeAcademia, ...opcoes] = process.argv.slice(2);
const gravar = opcoes.includes("--gravar");

const env = Object.fromEntries(
  fs.readFileSync(raiz + "/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ---------- Nomes: grafias da planilha → nome no sistema (confirmado com o Bruno) ----------
const chave = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const PROFESSORES = {
  bianca: "Bianca", bia: "Bianca",
  carol: "Carol",
  daniel: "Daniel", dan: "Daniel",
  dayane: "Dayane",
  debora: "Débora", deby: "Débora", deb: "Débora",
  monique: "Monique",
  priscila: "Priscila",
  roberto: "Roberto",
  robson: "Robson",
  rodrigo: "Rodrigo",
  rogerio: "Rogério",
  felipe: "Felipe",
  advilson: "Advilson", adivilson: "Advilson",
  cicero: "Cícero",
  joaogilberto: "João Gilberto", joaogilbertro: "João Gilberto", joaoglberto: "João Gilberto", jg: "João Gilberto",
  jonathan: "Jonathan Felipe", jonathanf: "Jonathan Felipe", jonathanfelipe: "Jonathan Felipe",
  joaofelipe: "João Felipe",
  luisfernando: "Luis Fernando", luiz: "Luis Fernando", fernando: "Luis Fernando",
  vinicius: "Vinicius", viniciua: "Vinicius",
  renan: "Renan",
  ryan: "Ryan",
  will: "Will", wil: "Will",
};
const MODALIDADES = {
  bodypump: "BODY PUMP", bodycombat: "BODY COMBAT", bodybalance: "BODY BALANCE", balance: "BODY BALANCE", bodylance: "BODY BALANCE",
  bodyattack: "BODY ATTACK", bodystep: "BODY STEP", bodyjam: "BODY JAM", bodyjump: "BODY JUMP",
  powerjump: "POWER JUMP", powerpump: "POWER PUMP", powercombat: "POWER COMBAT",
  fitdance: "FIT DANCE", alongamento: "ALONGAMENTO", alongamemto: "ALONGAMENTO",
  hiit: "HIIT", hit: "HIIT", hitt: "HIIT",
  jiujitsu: "JIU JITSU", muaythai: "MUAY THAI",
};
const SEM_MODALIDADE = new Set(["", "xxx"]);
const titulo = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());

// Nome do professor da planilha → partes já com o nome do sistema. Dupla ("A/B") ou "Daniel ( marina)" vem com
// mais de uma parte; a aula fica com o professor que costuma dar aquele horário (regra do Bruno).
function partesDoProfessor(bruto) {
  const texto = String(bruto ?? "").trim();
  if (!texto) return [];
  return texto
    .split(/[/()]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => PROFESSORES[chave(p)] ?? titulo(p));
}
// Modalidade: null = sem modalidade (a aula não entra, regra do Bruno).
function modalidade(bruto) {
  const texto = String(bruto ?? "").trim();
  if (SEM_MODALIDADE.has(chave(texto))) return { nome: null, unica: false };
  if (texto.includes("/")) return { nome: texto.split("/").map((p) => MODALIDADES[chave(p)] ?? p.trim().toUpperCase()).join(" / "), unica: false };
  return { nome: MODALIDADES[chave(texto)] ?? texto.replace(/s+/g, " ").toUpperCase(), unica: true };
}

// ---------- Leitura das células ----------
const v = (x) => (x && typeof x === "object" && !(x instanceof Date) ? ("result" in x ? x.result : x.richText ? x.richText.map((t) => t.text).join("") : x) : x);
function inteiro(x) {
  const y = v(x);
  if (typeof y === "number") return y >= 0 ? Math.round(y) : null;
  if (typeof y === "string" && y.trim() !== "" && !isNaN(Number(y.trim()))) return Math.max(0, Math.round(Number(y.trim())));
  return null;
}
function data(x) {
  const d = v(x);
  if (!(d instanceof Date)) return null;
  let s = d.toISOString().slice(0, 10);
  if (s.startsWith("2006-")) s = "2026" + s.slice(4); // digitado 2006 no lugar de 2026
  return s;
}
function hora(x, passo = 30) {
  const h = v(x);
  let s;
  if (h instanceof Date) s = h.toISOString().slice(11, 16);
  else {
    // Horário digitado como texto (ex.: "8;00", "18:30").
    const m = String(h ?? "").trim().match(/^(\d{1,2})[:;.h](\d{2})$/);
    if (!m) return null;
    s = `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  return (passo === 15 ? /:(00|15|30|45)$/ : /:(00|30)$/).test(s) ? s : null;
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(arquivo);
const [abaSala, abaColetivas, abaLutas] = wb.worksheets;
const avisos = [];
const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const sala = [];
abaSala.eachRow((row, r) => {
  if (r === 1) return;
  const d = data(row.getCell(1).value), h = hora(row.getCell(2).value);
  const musc = inteiro(row.getCell(3).value), cardio = inteiro(row.getCell(4).value), prof = inteiro(row.getCell(5).value);
  if (musc === null && cardio === null) return; // sem contagem (inclui dias futuros)
  if (!d || !h) { avisos.push(`${abaSala.name} linha ${r}: sem data/horário válido (ignorada)`); return; }
  if (d > hoje) return;
  sala.push({ data: d, horario: h, musculacao: musc ?? 0, cardio: cardio ?? 0, professores: prof });
});

const diaDaSemana = (d) => new Date(d + "T12:00:00Z").getUTCDay();
const brutas = [];
for (const [aba, origem] of [[abaColetivas, "coletivas"], [abaLutas, "lutas"]]) {
  aba.eachRow((row, r) => {
    if (r === 1) return;
    const qtd = inteiro(row.getCell(5).value);
    if (qtd === null) return; // sem quantidade (inclui aulas futuras)
    if ([row.getCell(3).value, row.getCell(4).value].some((c) => chave(v(c)) === "horavaga")) return;
    const m = modalidade(v(row.getCell(4).value));
    if (!m.nome) { avisos.push(`${aba.name} linha ${r}: sem modalidade (não entra)`); return; }
    // Pilates dado na sala de lutas conta como coletiva (regra do Bruno).
    const tipo = origem === "lutas" && chave(m.nome) === "pilates" ? "coletivas" : origem;
    const d = data(row.getCell(1).value), h = hora(row.getCell(2).value, tipo === "coletivas" ? 15 : 30);
    if (!d || !h) { avisos.push(`${aba.name} linha ${r}: sem data/horário válido (ignorada)`); return; }
    if (d > hoje) return;
    brutas.push({ tipo, data: d, horario: h, partes: partesDoProfessor(v(row.getCell(3).value)), modalidade: m, quantidade: qtd });
  });
}
// Quem dá cada horário (tipo + dia da semana + horário), contando só as aulas com um professor.
const doHorario = new Map();
for (const a of brutas) {
  if (a.partes.length !== 1) continue;
  const k = `${a.tipo}|${diaDaSemana(a.data)}|${a.horario}`;
  const m = doHorario.get(k) ?? new Map();
  m.set(a.partes[0], (m.get(a.partes[0]) ?? 0) + 1);
  doHorario.set(k, m);
}
const duplasResolvidas = new Map();
function professorDaAula(a) {
  if (a.partes.length <= 1) return a.partes[0] ?? null;
  const frequencia = doHorario.get(`${a.tipo}|${diaDaSemana(a.data)}|${a.horario}`) ?? new Map();
  const ordenados = [...frequencia.entries()].sort((x, y) => y[1] - x[1]);
  const escolhido = (ordenados.find(([n]) => a.partes.includes(n)) ?? ordenados[0] ?? [a.partes[0]])[0];
  const rotulo = a.partes.join(" / ") + " → " + escolhido;
  duplasResolvidas.set(rotulo, (duplasResolvidas.get(rotulo) ?? 0) + 1);
  return escolhido;
}
const contagem = new Map(); // aulas de cada professor por tipo (define o departamento)
const modalidadesNovas = new Set();
const coletivas = [], lutas = [];
for (const a of brutas) {
  const prof = professorDaAula(a);
  if (prof) {
    const c = contagem.get(prof) ?? { coletivas: 0, lutas: 0 };
    c[a.tipo]++;
    contagem.set(prof, c);
  }
  if (a.modalidade.unica) modalidadesNovas.add(a.modalidade.nome);
  (a.tipo === "coletivas" ? coletivas : lutas).push({ data: a.data, horario: a.horario, professor: prof, modalidade: a.modalidade.nome, quantidade: a.quantidade });
}

const { data: academia } = await admin.from("academias").select("id, nome").ilike("nome", nomeAcademia).single();
if (!academia) throw new Error(`Academia "${nomeAcademia}" não encontrada`);
const { data: funcionariosAtuais } = await admin.from("funcionarios").select("nome").eq("academia_id", academia.id);
const { data: modalidadesAtuais } = await admin.from("modalidades").select("nome").eq("academia_id", academia.id);
const jaTem = new Set((funcionariosAtuais ?? []).map((f) => chave(f.nome)));
const jaTemMod = new Set((modalidadesAtuais ?? []).map((m) => chave(m.nome)));

const novosProfessores = [...contagem.entries()]
  .filter(([nome]) => !jaTem.has(chave(nome)))
  .map(([nome, c]) => ({ nome, departamento: c.lutas > c.coletivas ? "professor_lutas" : "professor_coletivas", aulas: c }));
const novasModalidades = [...modalidadesNovas].filter((m) => !jaTemMod.has(chave(m))).sort();

const faixa = (l) => (l.length ? `${l.reduce((a, b) => (a.data < b.data ? a : b)).data} a ${l.reduce((a, b) => (a.data > b.data ? a : b)).data}` : "-");
console.log(`Academia: ${academia.nome}`);
console.log(`Contagem de sala: ${sala.length} linhas (${faixa(sala)})`);
console.log(`Coletivas: ${coletivas.length} aulas (${faixa(coletivas)}) · Lutas: ${lutas.length} aulas (${faixa(lutas)})`);
console.log(`Professores a cadastrar (${novosProfessores.length}): ${novosProfessores.map((p) => `${p.nome} [${p.departamento === "professor_lutas" ? "lutas" : "coletivas"}]`).join(", ")}`);
console.log(`Modalidades a cadastrar (${novasModalidades.length}): ${novasModalidades.join(", ")}`);
console.log(`Aulas com dois professores (ficaram com quem dá o horário): ${[...duplasResolvidas.entries()].map(([k, n]) => `${k} (${n})`).join(" · ")}`);
console.log(`Aulas em horários de 15 minutos: ${coletivas.filter((a) => /:(15|45)$/.test(a.horario)).length}`);
console.log(`Avisos: ${avisos.length}`);
for (const a of avisos.slice(0, 20)) console.log("  - " + a);

if (!gravar) {
  console.log("(simulação: nada foi gravado)");
  process.exit(0);
}

async function inserir(tabela, linhas) {
  for (let i = 0; i < linhas.length; i += 1000) {
    const { error } = await admin.from(tabela).insert(linhas.slice(i, i + 1000).map((l) => ({ ...l, academia_id: academia.id })));
    if (error) throw new Error(`${tabela}, a partir da linha ${i}: ${error.message}`);
  }
}
if (novosProfessores.length)
  await inserir("funcionarios", novosProfessores.map(({ nome, departamento }) => ({ nome, departamento })));
if (novasModalidades.length) await inserir("modalidades", novasModalidades.map((nome) => ({ nome })));
await inserir("contagem_sala", sala);
await inserir("contagem_coletivas", coletivas);
await inserir("contagem_lutas", lutas);
for (const t of ["funcionarios", "modalidades", "contagem_sala", "contagem_coletivas", "contagem_lutas"]) {
  const { count } = await admin.from(t).select("id", { count: "exact", head: true }).eq("academia_id", academia.id);
  console.log(`GRAVADO · ${t}: ${count} no sistema`);
}
