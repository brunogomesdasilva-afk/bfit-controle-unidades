// Usado só no servidor (importação da contagem de sala pela tela).
import ExcelJS from "exceljs";

// Leitura da aba CONTAGEM da "Planilha Operacional" (mesmas regras da importação inicial):
//   A data · B horário · C musculação · D cardio · E professores · G/H/I dia, mês e ano (se a data da coluna A
//   estiver vazia ou errada). Ano digitado 2006 vira 2026. Linhas sem contagem e datas futuras são ignoradas.
//   Professores: número; nome do professor conta 1; "não fez" fica em branco. Dia em que a coluna de professores
//   veio como sequência (3, 4, 5, 6…) — erro de arrastar a célula no Excel — fica com professores em branco.

export type ContagemSalaImportada = { data: string; horario: string; musculacao: number; cardio: number; professores: number | null };

const chave = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

const valor = (x: unknown): unknown => {
  if (x && typeof x === "object" && !(x instanceof Date)) {
    const o = x as { result?: unknown; richText?: { text: string }[] };
    if ("result" in o) return o.result;
    if (o.richText) return o.richText.map((t) => t.text).join("");
  }
  return x;
};

function inteiro(x: unknown): number | null {
  const y = valor(x);
  if (typeof y === "number") return y >= 0 ? Math.round(y) : null;
  if (typeof y === "string" && y.trim() !== "" && !isNaN(Number(y.trim()))) return Math.max(0, Math.round(Number(y.trim())));
  return null;
}

function data(x: unknown, row: ExcelJS.Row): string | null {
  const d = valor(x);
  let s: string;
  if (d instanceof Date) s = d.toISOString().slice(0, 10);
  else {
    const [dia, mes, digitado] = [7, 8, 9].map((c) => Number(valor(row.getCell(c).value)));
    const ano = digitado === 2006 ? 2026 : digitado; // digitado 2006 no lugar de 2026
    if (!(dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && ano >= 2020 && ano <= 2100)) return null;
    s = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
  if (s.startsWith("2006-")) s = "2026" + s.slice(4); // digitado 2006 no lugar de 2026
  return s;
}

function hora(x: unknown): string | null {
  const h = valor(x);
  let s: string;
  if (h instanceof Date) s = h.toISOString().slice(11, 16);
  else {
    const m = String(h ?? "").trim().match(/^(\d{1,2})[:;.h](\d{2})$/); // ex.: "8;00", "18:30"
    if (!m) return null;
    s = `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  return /:(00|30)$/.test(s) ? s : null;
}

function professores(x: unknown): number | null {
  const y = valor(x);
  if (typeof y === "string" && /[a-z]/i.test(y)) return /^nao/.test(chave(y)) ? null : 1;
  return inteiro(x);
}

export async function lerContagemSala(arquivo: Buffer, hoje: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arquivo as unknown as ArrayBuffer);
  const aba = wb.worksheets.find((w) => /^contagem$/i.test(w.name.trim())) ?? wb.worksheets[0];
  if (!aba) throw new Error("A planilha não tem nenhuma aba.");

  const linhas: ContagemSalaImportada[] = [];
  let semData = 0;
  let futuras = 0;
  aba.eachRow((row, r) => {
    if (r === 1) return;
    const musc = inteiro(row.getCell(3).value);
    const cardio = inteiro(row.getCell(4).value);
    if (musc === null && cardio === null) return; // sem contagem
    const d = data(row.getCell(1).value, row);
    const h = hora(row.getCell(2).value);
    if (!d || !h) {
      semData++;
      return;
    }
    if (d > hoje) {
      futuras++;
      return;
    }
    linhas.push({ data: d, horario: h, musculacao: musc ?? 0, cardio: cardio ?? 0, professores: professores(row.getCell(5).value) });
  });

  // Coluna de professores em sequência no dia (3, 4, 5, 6…): não é a quantidade de professores.
  const porDia = new Map<string, ContagemSalaImportada[]>();
  for (const l of linhas) porDia.set(l.data, [...(porDia.get(l.data) ?? []), l]);
  let diasEmSequencia = 0;
  for (const doDia of porDia.values()) {
    const ordenadas = [...doDia].sort((a, b) => a.horario.localeCompare(b.horario));
    const sequencia =
      ordenadas.length > 5 && ordenadas.every((l, i) => i === 0 || (l.professores !== null && l.professores === (ordenadas[i - 1].professores ?? NaN) + 1));
    if (sequencia) {
      diasEmSequencia++;
      for (const l of doDia) l.professores = null;
    }
  }

  // Mesmo dia e horário repetido na planilha: fica a primeira.
  const vistas = new Set<string>();
  const unicas = linhas.filter((l) => {
    const k = `${l.data}|${l.horario}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  return { aba: aba.name, linhas: unicas, repetidasNaPlanilha: linhas.length - unicas.length, semData, futuras, diasEmSequencia };
}
