// Usado só no servidor (Server Actions de importação).
import { Readable } from "node:stream";
import ExcelJS from "exceljs";

// Leitura dos relatórios em Excel (passagens na catraca e check-ins do Gympass).
// A planilha é lida em fluxo, linha a linha: arquivos grandes não sobrecarregam o servidor, e
// as milhares de linhas vazias formatadas no fim (o relatório do Gympass vem assim) são ignoradas.

export type TipoRelatorio = "passagens" | "gympass";

// Cabeçalho sem acento, sem espaços extras e em minúsculas, para achar a coluna pelo nome.
function normalizar(texto: unknown) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function valorDaCelula(v: unknown): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if ("result" in o) return o.result;
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text !== undefined) return o.text;
  }
  return v;
}

function texto(v: unknown) {
  const s = String(valorDaCelula(v) ?? "").trim();
  return s === "" ? null : s;
}

const dois = (n: number) => String(n).padStart(2, "0");

// Datas chegam como texto ("18/05/2026", "2026-06-01") ou como data do Excel.
function lerData(v: unknown): string | null {
  const x = valorDaCelula(v);
  if (x instanceof Date) return `${x.getUTCFullYear()}-${dois(x.getUTCMonth() + 1)}-${dois(x.getUTCDate())}`;
  const s = String(x ?? "").trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${dois(Number(m[2]))}-${dois(Number(m[1]))}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// Horas chegam como texto ("04:56", "23:40:04"), como data do Excel ou como fração do dia.
function lerHora(v: unknown): string | null {
  const x = valorDaCelula(v);
  if (x instanceof Date) return `${dois(x.getUTCHours())}:${dois(x.getUTCMinutes())}:${dois(x.getUTCSeconds())}`;
  if (typeof x === "number" && x >= 0 && x < 1) {
    const seg = Math.round(x * 86400);
    return `${dois(Math.floor(seg / 3600))}:${dois(Math.floor((seg % 3600) / 60))}:${dois(seg % 60)}`;
  }
  const m = String(x ?? "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return `${dois(Number(m[1]))}:${m[2]}:${m[3] ?? "00"}`;
}

function numero(v: unknown): number | null {
  const x = valorDaCelula(v);
  if (typeof x === "number") return x;
  const s = String(x ?? "").trim().replace(/^R\$\s*/, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}

// IDs longos (ex.: Wellhub com 13 dígitos) guardados como texto, sem casas decimais nem notação científica.
function identificador(v: unknown) {
  const x = valorDaCelula(v);
  if (typeof x === "number") return Number.isInteger(x) ? BigInt(x).toString() : String(x);
  return texto(x);
}

// Colunas esperadas em cada relatório (pelo nome do cabeçalho).
const COLUNAS = {
  passagens: {
    id: "id",
    tipo: "tipo",
    nome: "nome",
    entrada: "entrada por",
    dispositivo: "dispositivo",
    diaHora: "dia / hora de acesso",
    liberadoPor: "liberado por",
    motivo: "motivo",
    unidadeOrigem: "unidade de origem",
    acao: "acao",
  },
  gympass: {
    data: "data",
    hora: "hora",
    unidadeId: "id da unidade",
    unidade: "unidade",
    visitante: "visitante",
    wellhub: "id do wellhub",
    produto: "produto",
    periodo: "periodo de check-in",
    tipoCheckin: "tipo de check-in",
    pagamento: "pagamento",
  },
} as const;

const OBRIGATORIAS: Record<TipoRelatorio, string[]> = {
  passagens: ["nome", "dia / hora de acesso"],
  gympass: ["data", "hora", "visitante"],
};

export type LinhaImportada = Record<string, string | number | null> & { data: string; hora: string };

// Lê a primeira aba que tem o relatório (importação pela tela, uma academia por arquivo).
export async function lerRelatorio(tipo: TipoRelatorio, arquivo: Buffer) {
  const abas = await lerAbas(tipo, arquivo, true);
  return abas[0] ?? { aba: "", linhas: [], ignoradas: 0 };
}

// Lê todas as abas com o relatório (ex.: arquivo com uma aba por unidade). Abas sem o cabeçalho esperado
// são puladas; se nenhuma tiver, avisa que a planilha não é o relatório.
export async function lerAbas(tipo: TipoRelatorio, arquivo: Buffer, soAPrimeira = false) {
  const leitor = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(arquivo), {
    sharedStrings: "cache",
    styles: "ignore",
    hyperlinks: "ignore",
    worksheets: "emit",
  });

  const abas: { aba: string; linhas: LinhaImportada[]; ignoradas: number }[] = [];
  let erroCabecalho: string | null = null;

  for await (const aba of leitor) {
    const linhas: LinhaImportada[] = [];
    let ignoradas = 0;
    let indice: Map<string, number> | null = null;
    let valida = true;
    let vaziasSeguidas = 0;
    for await (const row of aba) {
      const valores = (row.values as unknown[]).slice(1);
      if (!indice) {
        // A primeira linha com conteúdo é o cabeçalho.
        if (valores.every((v) => texto(v) === null)) continue;
        indice = new Map(valores.map((v, i) => [normalizar(valorDaCelula(v)), i] as [string, number]));
        const faltando = OBRIGATORIAS[tipo].filter((c) => !indice!.has(c));
        if (faltando.length) {
          const nome = tipo === "passagens" ? "relatório de passagens" : "relatório do Gympass";
          erroCabecalho = `Esta planilha não parece ser o ${nome}: faltam as colunas ${faltando.join(", ")}.`;
          valida = false;
          break;
        }
        continue;
      }
      if (valores.every((v) => texto(v) === null)) {
        // Depois de muitas linhas vazias seguidas, o resto da aba é só formatação.
        if (++vaziasSeguidas >= 200) break;
        continue;
      }
      vaziasSeguidas = 0;

      const col = (nome: string) => {
        const i = indice!.get(nome);
        return i === undefined ? null : valores[i];
      };

      if (tipo === "passagens") {
        const c = COLUNAS.passagens;
        const diaHora = col(c.diaHora);
        const data = lerData(diaHora);
        const hora = lerHora(diaHora);
        if (!data || !hora) {
          ignoradas++;
          continue;
        }
        linhas.push({
          data,
          hora,
          cliente_id: identificador(col(c.id)),
          tipo: texto(col(c.tipo)),
          nome: texto(col(c.nome)),
          entrada_por: texto(col(c.entrada)),
          dispositivo: texto(col(c.dispositivo)),
          liberado_por: texto(col(c.liberadoPor)),
          motivo: texto(col(c.motivo)),
          unidade_origem: texto(col(c.unidadeOrigem)),
          acao: texto(col(c.acao)),
        });
      } else {
        const c = COLUNAS.gympass;
        const data = lerData(col(c.data));
        const hora = lerHora(col(c.hora));
        if (!data || !hora) {
          ignoradas++;
          continue;
        }
        linhas.push({
          data,
          hora,
          unidade_id: texto(col(c.unidadeId)),
          unidade: texto(col(c.unidade)),
          visitante: texto(col(c.visitante)),
          wellhub_id: identificador(col(c.wellhub)),
          produto: texto(col(c.produto)),
          periodo_checkin: texto(col(c.periodo)),
          tipo_checkin: texto(col(c.tipoCheckin)),
          pagamento: numero(col(c.pagamento)),
        });
      }
    }
    if (!valida || !indice) continue;
    // O leitor em fluxo só informa o nome da aba pela propriedade interna "name".
    abas.push({ aba: String((aba as unknown as { name?: string }).name ?? ""), linhas, ignoradas });
    if (soAPrimeira) break;
  }
  if (abas.length === 0 && erroCabecalho) throw new Error(erroCabecalho);

  return abas;
}
