// Usado só no servidor (botão "Fazer backup", administrador).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { zipSync, strToU8 } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hoje } from "@/lib/planilha";

// Pacote do backup (.zip) com três pastas:
//   codigo-fonte/    código do projeto baixado do GitHub (repositório privado)
//   dados-excel/     todas as tabelas em Excel, uma aba por tabela
//   banco-de-dados/  schema completo para criar um banco novo + um CSV por tabela para reimportar
// As linhas brutas de passagens e Gympass ficam de fora (são grandes e voltam reimportando os Excel
// originais); os resumos delas por dia e por hora entram.

export const PASTA_BACKUPS = "backups";
export const MANTER = 2; // quantos pacotes ficam guardados no armazenamento

// Tabelas do backup e a coluna usada para ordenar (e paginar) a leitura.
const TABELAS: [tabela: string, ordem: string[]][] = [
  ["academias", ["id"]],
  ["profiles", ["id"]],
  ["funcionarios", ["id"]],
  ["modalidades", ["id"]],
  ["datas_importantes", ["id"]],
  ["grade_aulas", ["id"]],
  ["feriados", ["id"]],
  ["escala", ["id"]],
  ["controle_diario", ["id"]],
  ["controle_conversao", ["id"]],
  ["contagem_sala", ["id"]],
  ["contagem_coletivas", ["id"]],
  ["contagem_lutas", ["id"]],
  ["compras", ["id"]],
  ["manutencoes", ["id"]],
  ["avaliacoes_adb", ["id"]],
  ["importacoes", ["id"]],
  ["produtos_joias", ["id"]],
  ["resumo_passagens_dia", ["academia_id", "data"]],
  ["resumo_passagens_hora", ["academia_id", "data", "hora"]],
  ["resumo_gympass_dia", ["academia_id", "data"]],
  ["resumo_gympass_hora", ["academia_id", "data", "hora"]],
  ["sistema_estado", ["id"]],
];

type Linha = Record<string, unknown>;

async function lerTabela(db: SupabaseClient, tabela: string, ordem: string[]) {
  const linhas: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    let q = db.from(tabela).select("*");
    for (const c of ordem) q = q.order(c);
    const { data, error } = await q.range(de, de + 999);
    if (error) throw new Error(`Tabela ${tabela}: ${error.message}`);
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) return linhas;
  }
}

const valorTexto = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

function csv(linhas: Linha[]) {
  if (linhas.length === 0) return "";
  const colunas = Object.keys(linhas[0]);
  const celula = (v: unknown) => {
    const s = valorTexto(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [colunas.join(","), ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(","))].join("\n");
}

// Todas as migrations em ordem, num arquivo só: roda num banco novo e recria toda a estrutura.
async function schemaCompleto() {
  const pasta = path.join(process.cwd(), "supabase", "migrations");
  const arquivos = (await readdir(pasta)).filter((a) => a.endsWith(".sql")).sort();
  const partes = await Promise.all(arquivos.map(async (a) => `-- ===== ${a} =====\n${await readFile(path.join(pasta, a), "utf8")}`));
  return [
    "-- BFIT · Controle de unidades · schema completo (todas as migrations em ordem).",
    "-- Para um banco novo no Supabase: cole tudo no SQL Editor e execute. Depois importe os CSV da pasta csv/.",
    "",
    ...partes,
  ].join("\n\n");
}

// Código-fonte: o .zip do repositório privado no GitHub (GITHUB_REPO = "dono/repositorio", GITHUB_TOKEN só leitura).
async function codigoFonte(): Promise<{ nome: string; conteudo: Uint8Array } | { aviso: string }> {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return { aviso: "GitHub ainda não configurado (GITHUB_REPO e GITHUB_TOKEN na Vercel): o código-fonte não entrou neste backup." };
  const resposta = await fetch(`https://api.github.com/repos/${repo}/zipball`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "bfit-backup" },
    redirect: "follow",
  });
  if (!resposta.ok) return { aviso: `Não foi possível baixar o código do GitHub (${resposta.status}). O código-fonte não entrou neste backup.` };
  return { nome: `${repo.split("/")[1]}-${hoje()}.zip`, conteudo: new Uint8Array(await resposta.arrayBuffer()) };
}

export async function montarBackup(db: SupabaseClient) {
  const data = hoje();
  const agora = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).replace(":", "h");

  const dados = await Promise.all(TABELAS.map(async ([t, ordem]) => [t, await lerTabela(db, t, ordem)] as const));

  // Excel: uma aba por tabela, com cabeçalho e filtro.
  const wb = new ExcelJS.Workbook();
  for (const [t, linhas] of dados) {
    const ws = wb.addWorksheet(t.slice(0, 31));
    const colunas = linhas.length ? Object.keys(linhas[0]) : ["(sem linhas)"];
    ws.addRow(colunas).font = { bold: true };
    for (const l of linhas) ws.addRow(colunas.map((c) => (l[c] !== null && typeof l[c] === "object" ? JSON.stringify(l[c]) : (l[c] ?? null))));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (linhas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
    ws.columns.forEach((c) => (c.width = 18));
  }
  const excel = new Uint8Array(await wb.xlsx.writeBuffer());

  const codigo = await codigoFonte();
  const contagens = dados.map(([t, l]) => `  ${t}: ${l.length} linhas`).join("\n");
  const leiaMe = [
    `BFIT · Controle de unidades · backup de ${data.split("-").reverse().join("/")} às ${agora}`,
    "",
    "codigo-fonte/    código do projeto (GitHub). Para publicar de novo: descompacte, rode 'npm install' e publique na Vercel.",
    "dados-excel/     todas as tabelas em Excel (uma aba por tabela), para consulta.",
    "banco-de-dados/  schema-completo.sql (cria o banco do zero) e csv/ (um arquivo por tabela para reimportar).",
    "",
    "Como recriar o banco num projeto novo do Supabase:",
    "  1. SQL Editor: cole e execute banco-de-dados/schema-completo.sql.",
    "  2. Table Editor: importe cada CSV na tabela de mesmo nome (comece por academias e profiles).",
    "  3. Os usuários (login e senha) ficam no Supabase Auth e não vão no backup: crie de novo em Usuários.",
    "  4. Passagens e Gympass: reimporte os Excel originais pelo sistema (os resumos já estão nos CSV).",
    "",
    "Tabelas:",
    contagens,
    ...("aviso" in codigo ? ["", `ATENÇÃO: ${codigo.aviso}`] : []),
  ].join("\n");

  const arquivos: Record<string, Uint8Array> = {
    "LEIA-ME.txt": strToU8(leiaMe),
    [`dados-excel/BFIT dados ${data}.xlsx`]: excel,
    "banco-de-dados/schema-completo.sql": strToU8(await schemaCompleto()),
  };
  for (const [t, linhas] of dados) arquivos[`banco-de-dados/csv/${t}.csv`] = strToU8(csv(linhas));
  if ("conteudo" in codigo) arquivos[`codigo-fonte/${codigo.nome}`] = codigo.conteudo;
  else arquivos["codigo-fonte/LEIA-ME.txt"] = strToU8(codigo.aviso);

  return {
    nome: `BFIT backup ${data} ${agora}.zip`,
    conteudo: zipSync(arquivos, { level: 6 }),
    avisoCodigo: "aviso" in codigo ? codigo.aviso : null,
  };
}
