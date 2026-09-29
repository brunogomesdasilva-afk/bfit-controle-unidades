// Usado só no servidor (importação do cadastro de clientes).
import { Readable } from "node:stream";
import ExcelJS from "exceljs";

// Leitura do Excel de clientes do sistema da rede: uma aba por unidade (o nome da aba é o nome da academia),
// colunas IDCLIENTE, NOME, BAIRRO, CIDADE, IDCONTRATO, CONTRATO, DATA DE NASCIMENTO, DIASATIVOS,
// DTINICIOCONTRATO, GÊNERO, STATUSCLIENTE, WELLHUB ID, VALORCONTRATO, DATAVENCIMENTOCONTRATO.
// O CPF é ignorado de propósito (não é guardado).

export type ClienteImportado = {
  cliente_id: string;
  nome: string | null;
  bairro: string | null;
  cidade: string | null;
  contrato_id: string | null;
  contrato: string | null;
  data_nascimento: string | null;
  dias_ativos: number | null;
  inicio_contrato: string | null;
  genero: string | null;
  status: string | null;
  wellhub_id: string | null;
  valor_contrato: number | null;
  vencimento_contrato: string | null;
};

const normalizar = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function valor(v: unknown): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if ("result" in o) return o.result;
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text !== undefined) return o.text;
  }
  return v;
}

const texto = (v: unknown) => {
  const s = String(valor(v) ?? "").trim();
  return s === "" ? null : s;
};

// IDs longos (Wellhub) como texto, sem notação científica.
const id = (v: unknown) => {
  const x = valor(v);
  if (typeof x === "number") return Number.isInteger(x) ? BigInt(x).toString() : String(x);
  return texto(x);
};

const numero = (v: unknown) => {
  const x = valor(v);
  if (typeof x === "number") return x;
  const s = String(x ?? "").trim();
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

// Datas vêm como número de série do Excel (ex.: 36954.125), como data ou como texto dd/mm/aaaa.
// Datas fora de 1900-2100 (digitação errada no sistema de origem) ficam vazias.
function data(v: unknown): string | null {
  const x = valor(v);
  const valida = (d: Date) => (!Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1900 && d.getUTCFullYear() <= 2100 ? d.toISOString().slice(0, 10) : null);
  if (x instanceof Date) return valida(x);
  if (typeof x === "number" && x > 0) return valida(new Date(Math.round(x - 25569) * 86400000));
  const m = String(x ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return valida(new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T12:00:00Z`));
  return null;
}

const COLUNAS: Record<keyof ClienteImportado, string> = {
  cliente_id: "idcliente",
  nome: "nome",
  bairro: "bairro",
  cidade: "cidade",
  contrato_id: "idcontrato",
  contrato: "contrato",
  data_nascimento: "data de nascimento",
  dias_ativos: "diasativos",
  inicio_contrato: "dtiniciocontrato",
  genero: "genero",
  status: "statuscliente",
  wellhub_id: "wellhub id",
  valor_contrato: "valorcontrato",
  vencimento_contrato: "datavencimentocontrato",
};

export async function lerClientes(arquivo: Buffer) {
  const leitor = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(arquivo), {
    sharedStrings: "cache",
    styles: "ignore",
    hyperlinks: "ignore",
    worksheets: "emit",
  });
  const abas: { aba: string; clientes: ClienteImportado[] }[] = [];
  for await (const ws of leitor) {
    let indice: Map<string, number> | null = null;
    const clientes = new Map<string, ClienteImportado>();
    for await (const row of ws) {
      const valores = (row.values as unknown[]).slice(1);
      if (!indice) {
        if (valores.every((v) => texto(v) === null)) continue;
        indice = new Map(valores.map((v, i) => [normalizar(valor(v)), i] as [string, number]));
        if (!indice.has("idcliente")) break; // aba que não é de clientes
        continue;
      }
      const col = (c: keyof ClienteImportado) => {
        const i = indice!.get(COLUNAS[c]);
        return i === undefined ? null : valores[i];
      };
      const cliente_id = id(col("cliente_id"));
      if (!cliente_id) continue;
      clientes.set(cliente_id, {
        cliente_id,
        nome: texto(col("nome")),
        bairro: texto(col("bairro")),
        cidade: texto(col("cidade")),
        contrato_id: id(col("contrato_id")),
        contrato: texto(col("contrato")),
        data_nascimento: data(col("data_nascimento")),
        dias_ativos: numero(col("dias_ativos")),
        inicio_contrato: data(col("inicio_contrato")),
        genero: texto(col("genero")),
        status: texto(col("status")),
        wellhub_id: id(col("wellhub_id")),
        valor_contrato: numero(col("valor_contrato")),
        vencimento_contrato: data(col("vencimento_contrato")),
      });
    }
    if (indice?.has("idcliente")) abas.push({ aba: String((ws as unknown as { name?: string }).name ?? ""), clientes: [...clientes.values()] });
  }
  return abas;
}
