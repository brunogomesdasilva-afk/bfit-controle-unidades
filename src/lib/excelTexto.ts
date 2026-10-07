import ExcelJS from "exceljs";

// Excel vira texto (uma linha por linha da planilha, colunas separadas por ";"), aba por aba.
export async function excelParaTexto(dados: ArrayBuffer) {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(dados);
  const partes: string[] = [];
  livro.eachSheet((aba) => {
    partes.push(`=== Aba: ${aba.name}${aba.state !== "visible" ? " (oculta)" : ""} ===`);
    aba.eachRow({ includeEmpty: false }, (linha, n) => {
      const valores = (linha.values as unknown[]).slice(1).map((v) => {
        if (v && typeof v === "object" && !(v instanceof Date)) {
          const o = v as { result?: unknown; formula?: string; richText?: { text: string }[]; text?: string };
          if (o.formula !== undefined) return `${String(o.result ?? "")} [fórmula: =${o.formula}]`;
          if (o.richText) return o.richText.map((t) => t.text).join("");
          if (o.text !== undefined) return o.text;
        }
        return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "");
      });
      partes.push(`${n}${linha.hidden ? " (oculta)" : ""}: ${valores.join(" ; ")}`);
    });
  });
  return partes.join("\n");
}
