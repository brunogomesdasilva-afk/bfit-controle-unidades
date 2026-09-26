// Importa as 3 primeiras abas da "Planilha Operacional <Academia>.xlsx" para o Controle de frequência:
//   CONTAGEM   → contagem_sala      (data, horário, musculação, cardio, professores)
//   GINASTICA  → contagem_coletivas (data, horário, professor, modalidade, quantidade)
//   LUTAS      → contagem_lutas     (data, horário, professor, modalidade, quantidade)
// Cadastra na academia os professores (Professor de coletivas / de lutas) e as modalidades que faltarem.
// Uso (na pasta do projeto): node scripts/importar-operacional.mjs "<arquivo.xlsx>" "<academia>" [--gravar] [--refazer]
// Sem --gravar só confere (simulação). --refazer apaga antes as contagens (sala, coletivas, lutas), os professores
// (de coletivas e de lutas) e as modalidades da academia: use só para refazer uma importação desta mesma planilha.
import fs from "node:fs";
import { createRequire } from "node:module";

const raiz = "C:/Users/bruno/Meu Drive/Trabalho/SmartSolution/Claude-CODE/bfit-controle-unidades";
const require = createRequire(raiz + "/package.json");
const ExcelJS = require("exceljs");
const { createClient } = require("@supabase/supabase-js");

const [arquivo, nomeAcademia, ...opcoes] = process.argv.slice(2);
const gravar = opcoes.includes("--gravar");
const refazer = opcoes.includes("--refazer");

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
  // Novo Osasco
  lidi: "Lidiane", lidiane: "Lidiane",
  max: "Maxwell", maxwell: "Maxwell",
  regina: "Regyna", regyna: "Regyna",
  tiagot: "Tiago Terra", tiagoterra: "Tiago Terra",
  thiagoc: "Thiago C.",
  // Km18
  day: "Dayane",
  adrjano: "Adriano",
  thiagoterra: "Tiago Terra",
  karol: "Carol",
};
// Regras de cada unidade (confirmadas com o Bruno): nomes que são professores já cadastrados na unidade e
// pessoas que só davam aula como substitutas (a aula vai para "professor substituto" e ninguém é cadastrado).
const POR_UNIDADE = {
  novoosasco: { substitutos: ["daniela", "adriano", "adrjano"] },
  rochdale: {
    professores: { luiz: "luís", felipe: "Filipi", caio: "caio cessar augusto" },
    substitutos: ["daniel"],
  },
};
const unidade = POR_UNIDADE[chave(nomeAcademia)] ?? {};
const nomeDoProfessor = (p) => unidade.professores?.[chave(p)] ?? PROFESSORES[chave(p)] ?? titulo(p);
// Texto de substituição no lugar do professor (a aula vai para "professor substituto", sem professor).
const SUBSTITUICAO = /^(sub|subistuicao|substituicao|substituto|ferias\w*)$/;
const MODALIDADES = {
  bodypump: "BODY PUMP", bodycombat: "BODY COMBAT", bodybalance: "BODY BALANCE", balance: "BODY BALANCE", bodylance: "BODY BALANCE",
  bodyattack: "BODY ATTACK", bodystep: "BODY STEP", bodyjam: "BODY JAM", bodyjump: "BODY JUMP",
  powerjump: "POWER JUMP", powerpump: "POWER PUMP", powercombat: "POWER COMBAT",
  fitdance: "FIT DANCE", alongamento: "ALONGAMENTO", alongamemto: "ALONGAMENTO",
  hiit: "HIIT", hit: "HIIT", hitt: "HIIT",
  jiujitsu: "JIU JITSU", muaythai: "MUAY THAI",
  // Erros de digitação e variações das outras unidades (confirmado com o Bruno)
  alogamento: "ALONGAMENTO", alonamento: "ALONGAMENTO", alongamen: "ALONGAMENTO",
  bodupump: "BODY PUMP", bodypump45: "BODY PUMP", powerjump45: "POWER JUMP",
  circuto: "CIRCUITO", mobiidade: "MOBILIDADE", firdance: "FIT DANCE", plates: "PILATES",
  muaythay: "MUAY THAI", muaythau: "MUAY THAI", jiu: "JIU JITSU",
  shbam: "SH'BAM",
  bodyvombat: "BODY COMBAT", set: "STEP", setp: "STEP", stepclass: "STEP",
  alongmob: "ALONGAMENTO / MOBILIDADE",
  bcross: "B-CROSS", cross: "B-CROSS", crosfit: "B-CROSS", crossfit: "B-CROSS",
};
const SEM_MODALIDADE = new Set(["", "xxx"]);
const titulo = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());

// Nome do professor da planilha → partes já com o nome do sistema. Dupla ("A/B") ou "Daniel ( marina)" vem com
// mais de uma parte; a aula fica com o professor que costuma dar aquele horário (regra do Bruno).
// "Elias/sub" fica com o Elias (a marca de substituição some); "Férias Terra" ou "subistuição" sozinhos viram
// substituição (professor em branco, texto no substituto).
function partesDoProfessor(bruto) {
  const texto = String(bruto ?? "").trim();
  if (!texto) return { partes: [], substituicao: null };
  const primeira = chave(texto.split(/\s/)[0]);
  if (SUBSTITUICAO.test(chave(texto)) || SUBSTITUICAO.test(primeira))
    return { partes: [], substituicao: chave(texto).startsWith("sub") ? "Substituição" : titulo(texto) };
  // Quem só dava aula como substituto nesta unidade (ex.: Daniela na Novo Osasco).
  if (unidade.substitutos?.includes(chave(texto))) return { partes: [], substituicao: titulo(texto) };
  const partes = texto
    .split(/[/()]/)
    .map((p) => p.trim())
    .filter((p) => p && !SUBSTITUICAO.test(chave(p)))
    .map(nomeDoProfessor);
  return { partes, substituicao: null };
}
// Modalidade: null = sem modalidade (a aula não entra, regra do Bruno).
function modalidade(bruto) {
  const texto = String(bruto ?? "").trim();
  if (SEM_MODALIDADE.has(chave(texto))) return { nome: null, unica: false };
  if (texto.includes("/")) return { nome: texto.split("/").map((p) => MODALIDADES[chave(p)] ?? p.trim().toUpperCase()).join(" / "), unica: false };
  const nome = MODALIDADES[chave(texto)] ?? texto.replace(/\s+/g, " ").toUpperCase();
  // Combinação (ex.: ALONG MOB = ALONGAMENTO / MOBILIDADE) não vira modalidade própria no cadastro.
  return { nome, unica: !nome.includes(" / ") };
}

// ---------- Leitura das células ----------
const v = (x) => (x && typeof x === "object" && !(x instanceof Date) ? ("result" in x ? x.result : x.richText ? x.richText.map((t) => t.text).join("") : x) : x);
// Coluna "Prof" da contagem de sala: número de professores; na Rochdale vem o nome do professor do horário
// (conta 1). Na Continental, a partir de 03/02/2026 a coluna foi preenchida com uma sequência (3, 4, 5… 21)
// que não é a quantidade de professores: fica em branco.
function quantosProfessores(x, d) {
  if (chave(nomeAcademia) === "continental" && d && d >= "2026-02-03") return null;
  const y = v(x);
  if (typeof y === "string" && /[a-z]/i.test(y)) return /^nao/.test(chave(y)) ? null : 1;
  return inteiro(x);
}
function inteiro(x) {
  const y = v(x);
  if (typeof y === "number") return y >= 0 ? Math.round(y) : null;
  if (typeof y === "string" && y.trim() !== "" && !isNaN(Number(y.trim()))) return Math.max(0, Math.round(Number(y.trim())));
  return null;
}
// Data da coluna A; se estiver vazia ou digitada errada, monta pelas colunas Dia, Mês e Ano (G, H, I).
function data(x, row) {
  const d = v(x);
  let s;
  if (d instanceof Date) s = d.toISOString().slice(0, 10);
  else if (row) {
    const [dia, mes, ano] = [7, 8, 9].map((c) => Number(v(row.getCell(c).value)));
    if (!(dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && ano >= 2020 && ano <= 2100)) return null;
    s = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  } else return null;
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
// Abas pelo nome (a ordem muda de uma planilha para outra).
const aba = (re) => wb.worksheets.find((w) => re.test(w.name.trim()));
const [abaSala, abaColetivas, abaLutas] = [aba(/^contagem$/i), aba(/^ginastica$/i), aba(/^lutas/i)];
if (!abaSala || !abaColetivas || !abaLutas) throw new Error("Não achei as abas CONTAGEM, GINASTICA e LUTAS");
const avisos = [];
const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const sala = [];
abaSala.eachRow((row, r) => {
  if (r === 1) return;
  const d = data(row.getCell(1).value, row), h = hora(row.getCell(2).value);
  const musc = inteiro(row.getCell(3).value), cardio = inteiro(row.getCell(4).value);
  const prof = quantosProfessores(row.getCell(5).value, d);
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
    // Hora vaga e feriado não são aulas.
    if ([row.getCell(3).value, row.getCell(4).value].some((c) => ["horavaga", "feriado"].includes(chave(v(c))))) return;
    const m = modalidade(v(row.getCell(4).value));
    if (!m.nome) { avisos.push(`${aba.name} linha ${r}: sem modalidade (não entra)`); return; }
    // Pilates dado na sala de lutas conta como coletiva (regra do Bruno).
    const tipo = origem === "lutas" && chave(m.nome) === "pilates" ? "coletivas" : origem;
    const d = data(row.getCell(1).value, row), h = hora(row.getCell(2).value, tipo === "coletivas" ? 15 : 30);
    if (!d || !h) { avisos.push(`${aba.name} linha ${r}: sem data/horário válido (ignorada)`); return; }
    if (d > hoje) return;
    const { partes, substituicao } = partesDoProfessor(v(row.getCell(3).value));
    brutas.push({ tipo, data: d, horario: h, partes, substituicao, modalidade: m, quantidade: qtd });
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
// Dupla: fica com quem dá aquele horário. Se nenhum da dupla dá o horário, a aula vai para "professor
// substituto" (com o professor em branco), em coletivas e em lutas (regra do Bruno).
function professorDaAula(a) {
  if (a.substituicao) return { professor: null, substituto: a.substituicao };
  if (a.partes.length <= 1) return { professor: a.partes[0] ?? null, substituto: null };
  const frequencia = doHorario.get(`${a.tipo}|${diaDaSemana(a.data)}|${a.horario}`) ?? new Map();
  const ordenados = [...frequencia.entries()].sort((x, y) => y[1] - x[1]);
  const daDupla = ordenados.find(([n]) => a.partes.includes(n));
  const resultado =
    daDupla
      ? { professor: daDupla[0], substituto: null }
      : { professor: null, substituto: a.partes.join(" / ") };
  const rotulo = `${a.partes.join(" / ")} → ${resultado.professor ?? "substituto"}`;
  duplasResolvidas.set(rotulo, (duplasResolvidas.get(rotulo) ?? 0) + 1);
  return resultado;
}
const contagem = new Map(); // aulas de cada professor por tipo (define o departamento)
const modalidadesNovas = new Set();
const coletivas = [], lutas = [];
for (const a of brutas) {
  const { professor: prof, substituto } = professorDaAula(a);
  if (prof) {
    const c = contagem.get(prof) ?? { coletivas: 0, lutas: 0 };
    c[a.tipo]++;
    contagem.set(prof, c);
  }
  if (a.modalidade.unica) modalidadesNovas.add(a.modalidade.nome);
  const base = { data: a.data, horario: a.horario, professor: prof, modalidade: a.modalidade.nome, quantidade: a.quantidade };
  (a.tipo === "coletivas" ? coletivas : lutas).push({ ...base, professor_substituto: substituto });
}

const { data: academia } = await admin.from("academias").select("id, nome").ilike("nome", nomeAcademia).single();
if (!academia) throw new Error(`Academia "${nomeAcademia}" não encontrada`);
const { data: funcionariosAtuais } = await admin.from("funcionarios").select("nome").eq("academia_id", academia.id);
const { data: modalidadesAtuais } = await admin.from("modalidades").select("nome").eq("academia_id", academia.id);
// Com --refazer, o que existe hoje será apagado: tudo é cadastrado de novo.
const jaTem = new Set(refazer ? [] : (funcionariosAtuais ?? []).map((f) => chave(f.nome)));
const jaTemMod = new Set(refazer ? [] : (modalidadesAtuais ?? []).map((m) => chave(m.nome)));

// Nomes já cadastrados na unidade: as aulas usam a mesma grafia do cadastro (ex.: "bodycombat" na Rochdale).
const grafiaProf = new Map(refazer ? [] : (funcionariosAtuais ?? []).map((f) => [chave(f.nome), f.nome]));
const grafiaMod = new Map(refazer ? [] : (modalidadesAtuais ?? []).map((m) => [chave(m.nome), m.nome]));
for (const l of [...coletivas, ...lutas]) {
  if (l.professor && grafiaProf.has(chave(l.professor))) l.professor = grafiaProf.get(chave(l.professor));
  if (l.modalidade && grafiaMod.has(chave(l.modalidade))) l.modalidade = grafiaMod.get(chave(l.modalidade));
}

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
const porTipo = new Map();
for (const a of avisos) { const k = a.replace(/linha d+/, "linha N"); porTipo.set(k, (porTipo.get(k) ?? 0) + 1); }
console.log(`Avisos: ${avisos.length}`);
for (const [k, n] of porTipo) console.log(`  - ${n}× ${k}`);
const porAno = (l) => Object.entries(l.reduce((t, a) => ((t[a.data.slice(0, 4)] = (t[a.data.slice(0, 4)] ?? 0) + 1), t), {})).map(([a, n]) => a + ":" + n).join(" ");
console.log(`Por ano · sala ${porAno(sala)} · coletivas ${porAno(coletivas)} · lutas ${porAno(lutas)}`);

if (!gravar) {
  console.log("(simulação: nada foi gravado)");
  process.exit(0);
}

if (refazer) {
  for (const t of ["contagem_sala", "contagem_coletivas", "contagem_lutas", "modalidades"]) {
    const { error } = await admin.from(t).delete().eq("academia_id", academia.id);
    if (error) throw new Error(`Erro ao apagar ${t}: ${error.message}`);
  }
  const { error } = await admin
    .from("funcionarios")
    .delete()
    .eq("academia_id", academia.id)
    .in("departamento", ["professor_coletivas", "professor_lutas"]);
  if (error) throw new Error(`Erro ao apagar professores: ${error.message}`);
  console.log("Importação anterior apagada.");
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
