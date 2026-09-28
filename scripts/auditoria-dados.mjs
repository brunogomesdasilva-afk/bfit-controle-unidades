// Auditoria dos dados do BFIT: gera uma planilha com tudo que foge do padrão e (com --enviar) manda por e-mail ao Bruno.
// Gera uma planilha por unidade (uma aba por tipo de ajuste).
// Uso (na pasta do projeto): node scripts/auditoria-dados.mjs "<pasta de saída>" [--enviar]
import fs from "node:fs";
import { createRequire } from "node:module";
const raiz = "C:/Users/bruno/Meu Drive/Trabalho/SmartSolution/Claude-CODE/bfit-controle-unidades";
const require = createRequire(raiz + "/package.json");
const { createClient } = require("@supabase/supabase-js");
const ExcelJS = require("exceljs");
const nodemailer = require("nodemailer");
const env = Object.fromEntries(
  fs.readFileSync(raiz + "/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const somarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const ontem = somarDias(hoje, -1);
const semana = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const br = (d) => (d ? d.split("-").reverse().join("/") : "");
const chave = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const mediana = (l) => { const s = [...l].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

async function todas(tabela, colunas = "*", filtro = (q) => q, ordem = "id") {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(db.from(tabela).select(colunas)).order(ordem).range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const academias = (await db.from("academias").select("*").order("nome")).data;
const nomeAc = Object.fromEntries(academias.map((a) => [a.id, a.nome]));
const [sala, coletivas, lutas, diario, funcionarios, modalidades, feriados, perfis, adb, conversao] = await Promise.all([
  todas("contagem_sala"), todas("contagem_coletivas"), todas("contagem_lutas"), todas("controle_diario"),
  todas("funcionarios"), todas("modalidades"), db.from("feriados").select("*").then((r) => r.data),
  db.from("profiles").select("*").then((r) => r.data), todas("avaliacoes_adb"), todas("controle_conversao"),
]);
const resPass = await todas("resumo_passagens_dia", "academia_id,data,entradas", (q) => q, "data");
const resGym = await todas("resumo_gympass_dia", "academia_id,data,checkins", (q) => q, "data");

const secoes = []; // { aba, titulo, explicacao, colunas, linhas }
const secao = (aba, titulo, explicacao, colunas) => { const s = { aba, titulo, explicacao, colunas, linhas: [] }; secoes.push(s); return s; };
const fechado = (ac, d) => feriados.some((f) => f.data === d && f.fechada && (!f.academia_id || f.academia_id === ac));
const feriadoDe = (ac, d) => feriados.find((f) => f.data === d && (!f.academia_id || f.academia_id === ac));

// ---------- 1. Contagens repetidas com valores diferentes ----------
{
  const s = secao("Contagens repetidas", "Contagens repetidas com valores diferentes",
    "Mesmo dia e horário (e modalidade, em coletivas/lutas) lançados mais de uma vez com números diferentes. Normalmente é data digitada errada na planilha. Decidir qual linha fica e apagar/corrigir a outra.",
    ["Unidade", "Contagem", "Data", "Dia", "Horário", "Modalidade", "Lançamentos (valores)"]);
  for (const [nome, linhas, k, v] of [
    ["Sala", sala, (r) => `${r.academia_id}|${r.data}|${r.horario}`, (r) => `musc ${r.musculacao} / cardio ${r.cardio} / prof ${r.professores ?? "-"}`],
    ["Coletivas", coletivas, (r) => `${r.academia_id}|${r.data}|${r.horario}|${r.modalidade}`, (r) => `${r.professor ?? r.professor_substituto ?? "-"}: ${r.quantidade} alunos`],
    ["Lutas", lutas, (r) => `${r.academia_id}|${r.data}|${r.horario}|${r.modalidade}`, (r) => `${r.professor ?? r.professor_substituto ?? "-"}: ${r.quantidade} alunos`],
  ]) {
    const g = new Map();
    for (const r of linhas) (g.get(k(r)) ?? g.set(k(r), []).get(k(r))).push(r);
    for (const l of g.values()) if (l.length > 1) s.linhas.push([nomeAc[l[0].academia_id], nome, br(l[0].data), DIAS[semana(l[0].data)], l[0].horario.slice(0, 5), l[0].modalidade ?? "", l.map(v).join("  |  ")]);
  }
  s.linhas.sort((a, b) => a[0].localeCompare(b[0]) || a[2].split("/").reverse().join().localeCompare(b[2].split("/").reverse().join()));
}

// ---------- 2. Contagens faltando (2026, mês a mês, grade de cada unidade) ----------
{
  const s = secao("Contagens faltando", "Contagens não feitas em 2026",
    "Horários da grade da unidade sem contagem. A grade sai do que a própria unidade costuma lançar em cada dia da semana (8 semanas antes do fim de cada mês). Feriado: sala segue a grade de domingo e coletivas/lutas não contam; feriado com academia fechada não conta. Se a aula não aconteceu, lançar quantidade 0.",
    ["Unidade", "Data", "Dia", "Contagem", "Horários faltando", "Qtde"]);
  const porTabela = { Sala: sala, Coletivas: coletivas, Lutas: lutas };
  for (const ac of academias) for (const [nome, linhas] of Object.entries(porTabela)) {
    const porData = new Map();
    for (const r of linhas) if (r.academia_id === ac.id) (porData.get(r.data) ?? porData.set(r.data, new Set()).get(r.data)).add(r.horario.slice(0, 5));
    const datas = [...porData.keys()].sort();
    if (!datas.length) continue;
    const primeiro = datas[0] > "2026-01-01" ? datas[0] : "2026-01-01";
    for (let mes = primeiro.slice(0, 7); mes <= ontem.slice(0, 7); mes = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 1)).toISOString().slice(0, 7)) {
      const fimMes = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).toISOString().slice(0, 10);
      const fim = fimMes < ontem ? fimMes : ontem;
      const iniGrade = somarDias(fim, 1 - 56);
      const vezes = new Map(), semanas = [0, 0, 0, 0, 0, 0, 0];
      for (let d = iniGrade; d <= fim; d = somarDias(d, 1)) {
        if (feriadoDe(ac.id, d)) continue;
        semanas[semana(d)]++;
        for (const h of porData.get(d) ?? []) vezes.set(`${semana(d)}|${h}`, (vezes.get(`${semana(d)}|${h}`) ?? 0) + 1);
      }
      const grade = [0, 1, 2, 3, 4, 5, 6].map((w) => [...vezes].filter(([k, n]) => k.startsWith(`${w}|`) && n >= semanas[w] / 2).map(([k]) => k.slice(2)).sort());
      const ini = `${mes}-01` > primeiro ? `${mes}-01` : primeiro;
      for (let d = ini; d <= fim; d = somarDias(d, 1)) {
        const f = feriadoDe(ac.id, d);
        if (f?.fechada || (f && nome !== "Sala")) continue;
        const faltam = grade[f ? 0 : semana(d)].filter((h) => !(porData.get(d) ?? new Set()).has(h));
        if (faltam.length) s.linhas.push([ac.nome, br(d), DIAS[semana(d)], nome, faltam.join(", "), faltam.length]);
      }
    }
  }
  s.linhas.sort((a, b) => a[0].localeCompare(b[0]) || a[1].split("/").reverse().join().localeCompare(b[1].split("/").reverse().join()) || a[3].localeCompare(b[3]));
}

// ---------- 3. Diário ----------
{
  const faltando = secao("Diário faltando", "Dias sem lançamento no Diário (vendas)",
    "Dias entre o primeiro lançamento da unidade e ontem sem nenhuma linha no Diário (feriado com academia fechada não conta).",
    ["Unidade", "Data", "Dia"]);
  const fora = secao("Diário fora do padrão", "Diário com valores fora do padrão",
    "Valores que parecem erro de digitação ou campo esquecido. Conferir com o sistema de origem e corrigir na tela Vendas → Diário.",
    ["Unidade", "Data", "Campo", "Valor lançado", "Por que chamou atenção"]);
  for (const ac of academias) {
    const l = diario.filter((r) => r.academia_id === ac.id).sort((a, b) => a.data.localeCompare(b.data));
    if (!l.length) continue;
    const tem = new Set(l.map((r) => r.data));
    for (let d = l[0].data; d <= ontem; d = somarDias(d, 1)) if (!tem.has(d) && !fechado(ac.id, d)) faltando.linhas.push([ac.nome, br(d), DIAS[semana(d)]]);
    const porMes = new Map();
    for (const r of l) if (r.faturamento > 0) (porMes.get(r.data.slice(0, 7)) ?? porMes.set(r.data.slice(0, 7), []).get(r.data.slice(0, 7))).push(Number(r.faturamento));
    let anterior = null;
    for (const r of l) {
      const med = mediana(porMes.get(r.data.slice(0, 7)) ?? []);
      const add = (campo, valor, motivo) => fora.linhas.push([ac.nome, br(r.data), campo, valor, motivo]);
      if (r.data >= "2025-01-01") {
        for (const c of ["ativos_pagantes", "visitas", "vendas", "inadimplentes", "faturamento", "cancelamentos_solicitados", "cancelamentos_efetivados"])
          if (r[c] === null) add(c.replace(/_/g, " "), "(vazio)", "campo não preenchido");
      }
      if (r.faturamento !== null && med && Number(r.faturamento) > med * 4) add("faturamento", Number(r.faturamento).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), `mais de 4× a mediana do mês (${med.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`);
      if (r.faturamento !== null && Number(r.faturamento) < 0) add("faturamento", r.faturamento, "valor negativo");
      if (r.nps !== null && (r.nps > 100 || r.nps < -100)) add("NPS", r.nps, "NPS deve ficar entre -100 e 100");
      if (r.inadimplentes !== null && r.ativos_pagantes && r.inadimplentes > r.ativos_pagantes * 0.5) add("inadimplentes", r.inadimplentes, `mais da metade dos ativos (${r.ativos_pagantes})`);
      if (anterior?.ativos_pagantes && r.ativos_pagantes && Math.abs(r.ativos_pagantes - anterior.ativos_pagantes) / anterior.ativos_pagantes > 0.08)
        add("ativos pagantes", `${anterior.ativos_pagantes} → ${r.ativos_pagantes}`, `variação de ${Math.round(((r.ativos_pagantes - anterior.ativos_pagantes) / anterior.ativos_pagantes) * 100)}% de um dia para o outro`);
      if (r.ativos_pagantes) anterior = r;
    }
  }
}

// ---------- 4. Contagens fora do padrão ----------
{
  const s = secao("Contagens fora do padrão", "Contagens com números fora do padrão",
    "Valores muito acima do normal da unidade no mesmo dia da semana e horário (sala, mais de 3×) ou na mesma modalidade (coletivas/lutas, mais de 4× e 30 alunos ou mais), sala com 0 pessoas em horário movimentado, aulas sem professor e sem substituto, e sala sem quantidade de professores.",
    ["Unidade", "Contagem", "Data", "Horário", "Detalhe", "Por que chamou atenção"]);
  for (const ac of academias) {
    const ls = sala.filter((r) => r.academia_id === ac.id);
    const ref = new Map();
    for (const r of ls) { const k = `${semana(r.data)}|${r.horario}`; (ref.get(k) ?? ref.set(k, []).get(k)).push(r.musculacao + r.cardio); }
    for (const r of ls) {
      const med = mediana(ref.get(`${semana(r.data)}|${r.horario}`));
      const tot = r.musculacao + r.cardio;
      if (med >= 10 && tot > med * 3) s.linhas.push([ac.nome, "Sala", br(r.data), r.horario.slice(0, 5), `musc ${r.musculacao} + cardio ${r.cardio} = ${tot}`, `mais de 3× o normal do horário (${med})`]);
      if (med >= 10 && tot === 0) s.linhas.push([ac.nome, "Sala", br(r.data), r.horario.slice(0, 5), "0 pessoas", `horário que costuma ter ${med}`]);
    }
    const semProf = ls.filter((r) => r.professores === null && r.data >= "2026-01-01");
    if (semProf.length) {
      const datas = semProf.map((r) => r.data).sort();
      s.linhas.push([ac.nome, "Sala", `${br(datas[0])} a ${br(datas.at(-1))}`, "", `${semProf.length} contagens de 2026 sem quantidade de professores`, "sem professores não dá para calcular alunos por professor"]);
    }
    for (const [nome, linhas] of [["Coletivas", coletivas], ["Lutas", lutas]]) {
      const l = linhas.filter((r) => r.academia_id === ac.id);
      const refM = new Map();
      for (const r of l) (refM.get(r.modalidade) ?? refM.set(r.modalidade, []).get(r.modalidade)).push(r.quantidade);
      for (const r of l) {
        const med = mediana(refM.get(r.modalidade));
        if (med >= 3 && r.quantidade > med * 4 && r.quantidade >= 30) s.linhas.push([ac.nome, nome, br(r.data), r.horario.slice(0, 5), `${r.modalidade}: ${r.quantidade} alunos`, `mais de 4× o normal da modalidade (${med})`]);
        if (!r.professor && !r.professor_substituto) s.linhas.push([ac.nome, nome, br(r.data), r.horario.slice(0, 5), `${r.modalidade}: ${r.quantidade} alunos`, "sem professor e sem substituto"]);
      }
    }
  }
}

// ---------- 5. Cadastros: funcionários, modalidades, academias, usuários ----------
{
  const s = secao("Cadastros", "Cadastros incompletos ou duplicados",
    "Funcionários, modalidades, academias e usuários que precisam de ajuste. Corrigir em Academias → (unidade) → Funcionários / Modalidades, na própria academia e em Usuários.",
    ["Unidade", "Cadastro", "Item", "O que ajustar"]);
  const DEP = { gerente: "Gerente", recepcao: "Recepção", professores: "Professores (sala)", professor_coletivas: "Professor de coletivas", professor_lutas: "Professor de lutas", estagiario: "Estagiário", limpeza: "Limpeza" };
  for (const ac of academias) {
    const fs_ = funcionarios.filter((f) => f.academia_id === ac.id);
    for (const dep of ["gerente", "recepcao", "professores", "limpeza"])
      if (!fs_.some((f) => f.departamento === dep)) s.linhas.push([ac.nome, "Funcionários", DEP[dep], "nenhum funcionário deste departamento (escala, A.D.B e lembretes dependem disso)"]);
    const semNasc = fs_.filter((f) => !f.data_nascimento);
    if (semNasc.length) s.linhas.push([ac.nome, "Funcionários", `${semNasc.length} de ${fs_.length}`, `sem data de nascimento (sem lembrete de aniversário): ${semNasc.map((f) => f.nome).join(", ")}`]);
    for (const f of fs_) {
      if (["recepcao", "professores", "estagiario", "limpeza", "gerente"].includes(f.departamento) && (!f.horario_entrada || !f.horario_saida)) s.linhas.push([ac.nome, "Funcionários", f.nome, "sem horário de entrada/saída (escala e período da A.D.B)"]);
      if (f.nome !== f.nome.trim() || /^[a-zà-ú]/.test(f.nome)) s.linhas.push([ac.nome, "Funcionários", f.nome, "nome em minúsculas ou com espaço sobrando: padronizar (ex.: \"Mario\")"]);
    }
    const porChave = new Map();
    for (const f of fs_) (porChave.get(chave(f.nome)) ?? porChave.set(chave(f.nome), []).get(chave(f.nome))).push(f);
    for (const l of porChave.values()) if (l.length > 1) s.linhas.push([ac.nome, "Funcionários", l.map((f) => `${f.nome} (${DEP[f.departamento]})`).join(" / "), "mesmo nome cadastrado mais de uma vez: conferir se é a mesma pessoa"]);
    for (const a of fs_) for (const b of fs_) if (a.id < b.id && chave(a.nome) !== chave(b.nome) && chave(a.nome).length >= 3 && (chave(b.nome).startsWith(chave(a.nome)) || chave(a.nome).startsWith(chave(b.nome))))
      s.linhas.push([ac.nome, "Funcionários", `${a.nome} (${DEP[a.departamento]}) / ${b.nome} (${DEP[b.departamento]})`, "nomes parecidos: conferir se é a mesma pessoa"]);
    const ms = modalidades.filter((m) => m.academia_id === ac.id);
    for (const a of ms) for (const b of ms) if (a.id < b.id) {
      const [x, y] = [chave(a.nome), chave(b.nome)];
      if (x === y || x.includes(y) || y.includes(x)) s.linhas.push([ac.nome, "Modalidades", `${a.nome} / ${b.nome}`, "modalidades parecidas: conferir se são a mesma (ex.: PUMP e BODY PUMP)"]);
    }
    for (const m of ms) if (m.nome !== m.nome.toUpperCase()) s.linhas.push([ac.nome, "Modalidades", m.nome, "padronizar em maiúsculas como as demais"]);
    const usadas = new Set([...coletivas, ...lutas].filter((r) => r.academia_id === ac.id).map((r) => r.modalidade));
    for (const m of ms) if (!usadas.has(m.nome)) s.linhas.push([ac.nome, "Modalidades", m.nome, "cadastrada mas sem nenhuma aula lançada"]);
    for (const [c, rot] of [["area_m2", "área (m²)"], ["custo_financeiro", "custo financeiro"]]) if (!ac[c]) s.linhas.push([ac.nome, "Academia", rot, "não preenchido (Painel mostra —)"]);
    if (!perfis.some((p) => p.academia_id === ac.id && p.ativo)) s.linhas.push([ac.nome, "Usuários", "gerente", "nenhum usuário ativo da unidade (ninguém recebe e-mails nem lembretes da unidade)"]);
    if (!feriados.some((f) => f.academia_id === ac.id)) s.linhas.push([ac.nome, "Feriados", "municipais", "nenhum feriado da cidade cadastrado (ex.: aniversário da cidade, Corpus Christi); hoje só os nacionais"]);
  }
  for (const p of perfis) if (!p.ativo) s.linhas.push([nomeAc[p.academia_id] ?? "-", "Usuários", p.nome, "usuário inativo"]);
}

// ---------- 6. Passagens e Gympass ----------
{
  const s = secao("Passagens e Gympass", "Relatórios de passagens e Gympass",
    "Períodos importados e dias sem nenhum registro dentro do período (pode ser dia sem exportação do relatório).",
    ["Unidade", "Relatório", "Período importado", "Dias sem registro no período", "Falta importar"]);
  for (const ac of academias) for (const [nome, res] of [["Passagens", resPass], ["Gympass", resGym]]) {
    const datas = res.filter((r) => r.academia_id === ac.id).map((r) => r.data).sort();
    if (!datas.length) { s.linhas.push([ac.nome, nome, "nada importado", "", "tudo"]); continue; }
    const tem = new Set(datas), vazios = [];
    for (let d = datas[0]; d <= datas.at(-1); d = somarDias(d, 1)) if (!tem.has(d) && !fechado(ac.id, d)) vazios.push(br(d).slice(0, 5));
    s.linhas.push([ac.nome, nome, `${br(datas[0])} a ${br(datas.at(-1))}`, vazios.length ? `${vazios.length}: ${vazios.join(", ")}` : "nenhum", `de ${br(somarDias(datas.at(-1), 1))} até hoje`]);
  }
}

// ---------- 7. Outros pontos ----------
{
  const s = secao("Outros pontos", "Outros pontos observados",
    "Situações que fogem do padrão e que vale decidir o que fazer.", ["Unidade", "Assunto", "Situação", "Sugestão"]);
  const km = academias.find((a) => a.nome === "Km18");
  const ultLutaKm = lutas.filter((r) => r.academia_id === km?.id).map((r) => r.data).sort().at(-1);
  if (km && ultLutaKm < "2026-01-01") s.linhas.push(["Km18", "Lutas", `última aula de luta lançada em ${br(ultLutaKm)}`, "se a Km18 ainda tem lutas, a planilha de 2026 não trouxe; se não tem mais, apagar as modalidades de luta do cadastro"]);
  const roch = academias.find((a) => a.nome === "Rochdale");
  const col2025 = coletivas.filter((r) => r.academia_id === roch?.id && r.data < "2026-01-01");
  for (const r of col2025) s.linhas.push(["Rochdale", "Coletivas", `aula em ${br(r.data)} ${r.horario.slice(0, 5)} (${r.modalidade}), antes da unidade começar a lançar`, "provável ano digitado errado (2025 no lugar de 2026): corrigir a data"]);
  s.linhas.push(["Continental", "Contagem de sala", "coluna 'Prof' da planilha vinha com uma sequência (3, 4, 5… 21) desde 03/02/2026; a quantidade de professores ficou em branco", "preencher a quantidade real ou me pedir para usar o padrão de janeiro"]);
  s.linhas.push(["Rochdale", "Contagem de sala", "a planilha trazia o nome do professor no lugar da quantidade; foi gravado 1 professor por horário", "conferir horários com mais de um professor"]);
  if (!conversao.length) s.linhas.push(["Todas", "Conversão", "nenhuma visita não convertida lançada", "começar a lançar para o Painel mostrar os motivos de não conversão"]);
  s.linhas.push(["Todas", "A.D.B", `${adb.length} avaliação lançada no sistema`, "lançar as avaliações do mês pelo sistema"]);
  const km18 = diario.find((r) => r.academia_id === km?.id && r.data === "2026-05-07");
  if (km18) s.linhas.push(["Km18", "Diário", `faturamento de 07/05/2026 estava R$ 10.597.663,00; corrigido para ${Number(km18.faturamento).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, "já corrigido (só para registro)"]);
}

// Ordena por unidade e data (datas "dd/mm/aaaa" comparadas como aaaa-mm-dd).
const iso = (x) => String(x ?? "").split(" ")[0].split("/").reverse().join("-");
for (const s of secoes) if (s.aba === "Contagens fora do padrão" || s.aba === "Diário fora do padrão")
  s.linhas.sort((x, y) => String(x[0]).localeCompare(String(y[0])) || iso(x[s.aba === "Diário fora do padrão" ? 1 : 2]).localeCompare(iso(y[s.aba === "Diário fora do padrão" ? 1 : 2])));

// ---------- Planilhas: uma por unidade, uma aba por tipo de ajuste (só as abas com itens) ----------
const saida = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
const arquivos = [];
for (const ac of academias) {
  // Itens da unidade (e os que valem para todas); a coluna "Unidade" sai, porque o arquivo já é da unidade.
  const daUnidade = secoes
    .map((s) => ({ ...s, colunas: s.colunas.slice(1), linhas: s.linhas.filter((l) => l[0] === ac.nome || l[0] === "Todas").map((l) => l.slice(1)) }))
    .filter((s) => s.linhas.length);
  const wb = new ExcelJS.Workbook();
  const resumo = wb.addWorksheet("Resumo");
  resumo.columns = [{ width: 30 }, { width: 10 }, { width: 110 }];
  resumo.addRow([`BFIT · Conferência · ${ac.nome}`, "", `Gerada em ${br(hoje)}`]).font = { bold: true, size: 14 };
  resumo.addRow([]);
  resumo.addRow(["Aba", "Itens", "O que ajustar"]).font = { bold: true };
  for (const s of daUnidade) resumo.addRow([s.aba, s.linhas.length, s.explicacao]).alignment = { wrapText: true, vertical: "top" };
  if (!daUnidade.length) resumo.addRow(["Nada a ajustar nesta unidade."]);
  for (const s of daUnidade) {
    const ws = wb.addWorksheet(s.aba.slice(0, 31));
    ws.addRow([`${s.titulo} · ${ac.nome}`]).font = { bold: true, size: 13 };
    ws.addRow([s.explicacao]);
    ws.addRow([]);
    const cab = ws.addRow(s.colunas);
    cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cab.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B4EA2" } }));
    for (const l of s.linhas) ws.addRow(l);
    ws.columns.forEach((c, i) => (c.width = Math.min(90, Math.max(12, ...[s.colunas[i] ?? "", ...s.linhas.map((l) => String(l[i] ?? ""))].map((x) => String(x).length + 2)))));
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: s.colunas.length } };
  }
  const arquivo = `${saida}/Conferência ${ac.nome} ${hoje}.xlsx`;
  await wb.xlsx.writeFile(arquivo);
  arquivos.push({ unidade: ac.nome, arquivo, abas: daUnidade.map((s) => `${s.aba}: ${s.linhas.length}`) });
  console.log(ac.nome, "→", daUnidade.map((s) => `${s.aba} ${s.linhas.length}`).join(" · "));
}

if (process.argv.includes("--enviar")) {
  const porta = Number(env.SMTP_PORT ?? 587);
  const t = nodemailer.createTransport({ host: env.SMTP_HOST, port: porta, secure: porta === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  await t.sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER,
    to: "brunogomesdasilva@gmail.com",
    subject: `BFIT · Conferência dos dados por unidade · ${br(hoje)}`,
    text: [
      "Olá, Bruno,",
      "",
      "Seguem em anexo as planilhas de conferência, uma por unidade. Cada arquivo tem uma aba por tipo de ajuste (só as que têm itens), com a explicação no topo e filtro nas colunas.",
      "",
      ...arquivos.flatMap((a) => [`${a.unidade}:`, ...(a.abas.length ? a.abas.map((x) => `  - ${x}`) : ["  - nada a ajustar"]), ""]),
      "Sugestão de ordem: 1) Cadastros, 2) Contagens repetidas, 3) Diário fora do padrão, 4) Contagens faltando e fora do padrão, 5) Passagens e Gympass que faltam importar.",
      "",
      "Gerado pelo Claude para o sistema BFIT · Controle de unidades.",
    ].join("\n"),
    attachments: arquivos.map((a) => ({ filename: a.arquivo.split("/").pop(), path: a.arquivo })),
  });
  console.log("e-mail enviado");
}
