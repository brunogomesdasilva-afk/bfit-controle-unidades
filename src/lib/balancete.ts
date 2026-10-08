import ExcelJS from "exceljs";

// Balancete da contabilidade (Excel, aba "Balancete"): Conta contábil | Descrição | Saldo anterior | Débito | Crédito |
// Saldo atual. Sinais como vêm da contabilidade: ativo e despesa positivos quando devedores; passivo, patrimônio e
// receita positivos quando credores. Lido no servidor (importação) e no script de carga inicial.

export type LinhaBalancete = {
  ordem: number;
  conta: string;
  descricao: string;
  saldo_anterior: number;
  debito: number;
  credito: number;
  saldo_atual: number;
};

const num = (v: unknown) => {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in v) return Number((v as { result: unknown }).result) || 0;
  const t = String(v ?? "").trim();
  if (!t) return 0;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
};
const txt = (v: unknown) => (v && typeof v === "object" && "richText" in v ? (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("") : String(v ?? "")).trim();

export async function lerBalancete(dados: ArrayBuffer): Promise<LinhaBalancete[]> {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(dados);
  // A aba que tem o cabeçalho "Conta contábil" (normalmente "Balancete").
  for (const aba of livro.worksheets) {
    let colunas: number[] | null = null;
    const linhas: LinhaBalancete[] = [];
    aba.eachRow({ includeEmpty: false }, (linha) => {
      const valores = (linha.values as unknown[]).slice(1).map((v) => v);
      if (!colunas) {
        const cab = valores.map((v) => txt(v).toLowerCase());
        const i = cab.findIndex((c) => c.startsWith("conta"));
        if (i >= 0 && cab.some((c) => c.includes("saldo atual"))) colunas = [i, i + 1, i + 2, i + 3, i + 4, i + 5];
        return;
      }
      const conta = txt(valores[colunas[0]]);
      // Só linhas com conta no formato 1, 1.1, 1.1.1.02.0015... (o rodapé com totais fica de fora).
      if (!/^\d+(\.\d+)*$/.test(conta)) return;
      linhas.push({
        ordem: linhas.length + 1,
        conta,
        descricao: txt(valores[colunas[1]]).replace(/\s+/g, " "),
        saldo_anterior: num(valores[colunas[2]]),
        debito: num(valores[colunas[3]]),
        credito: num(valores[colunas[4]]),
        saldo_atual: num(valores[colunas[5]]),
      });
    });
    if (linhas.length) return linhas;
  }
  throw new Error('Não achei o balancete: a planilha precisa ter as colunas "Conta contábil", "Descrição", "Saldo anterior", "Débito", "Crédito" e "Saldo atual".');
}

// Confere se o balancete fecha: ativo = passivo (com patrimônio) + resultado do período (receitas − despesas).
export function conferirFechamento(linhas: LinhaBalancete[]) {
  const total = (c: string, campo: "saldo_atual" | "saldo_anterior") => linhas.find((l) => l.conta === c)?.[campo] ?? 0;
  const resultado = total("4", "saldo_atual") - total("3", "saldo_atual") - (total("4", "saldo_anterior") - total("3", "saldo_anterior"));
  const diferenca = total("1", "saldo_atual") - total("2", "saldo_atual") - resultado - (total("4", "saldo_anterior") - total("3", "saldo_anterior"));
  return { ativo: total("1", "saldo_atual"), passivo: total("2", "saldo_atual"), resultado, diferenca: Math.round(diferenca * 100) / 100 };
}
