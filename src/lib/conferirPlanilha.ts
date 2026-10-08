import ExcelJS from "exceljs";

// Verificação automática das planilhas do lote (feita pelo sistema, sem depender da leitura do Claude):
//   - cada fórmula SOMA é refeita célula a célula e comparada com o valor gravado na planilha;
//   - valores da mesma coluna que ficaram FORA do intervalo da soma (linha esquecida na fórmula);
//   - no fluxo de pagamentos: "Dbto Auto" = soma das linhas de débito automático e "Banco" = Total − Dbto Auto.
// O resultado vai para o Claude junto com o lote e ele reporta no relatório.

const CENTAVO = 0.005;
const reais = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Valor = { numero: number | null; formula: string | null; texto: string };

function ler(celula: ExcelJS.Cell): Valor {
  const v = celula.value as unknown;
  if (typeof v === "number") return { numero: v, formula: null, texto: String(v) };
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { formula?: string; sharedFormula?: string; result?: unknown; richText?: { text: string }[] };
    const formula = o.formula ?? o.sharedFormula ?? null;
    if (formula !== null) return { numero: typeof o.result === "number" ? o.result : null, formula, texto: String(o.result ?? "") };
    if (o.richText) return { numero: null, formula: null, texto: o.richText.map((t) => t.text).join("") };
  }
  return { numero: null, formula: null, texto: v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "") };
}

const colNum = (letras: string) => letras.toUpperCase().split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const colLetra = (n: number): string => (n > 26 ? colLetra(Math.floor((n - 1) / 26)) : "") + String.fromCharCode(65 + ((n - 1) % 26));

export async function conferirPlanilha(dados: ArrayBuffer, nomeArquivo: string): Promise<string[]> {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(dados);
  const achados: string[] = [];
  livro.eachSheet((aba) => {
    const onde = (ref: string) => `"${nomeArquivo}", aba "${aba.name}", célula ${ref}`;
    const valor = (col: number, linha: number) => ler(aba.getRow(linha).getCell(col));
    const somaFormulas: { ref: string; col: number; ini: number; fim: number; linha: number; gravado: number | null }[] = [];
    // Rótulos de totais digitados ao lado (ex.: "Total", "Dbto Auto", "Banco") e o valor na célula seguinte.
    const rotulos: Record<string, { ref: string; v: Valor; linha: number }> = {};

    aba.eachRow({ includeEmpty: false }, (linha, n) => {
      linha.eachCell({ includeEmpty: false }, (celula, c) => {
        const v = ler(celula);
        const soma = v.formula?.replace(/\s/g, "").match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/i);
        if (soma && soma[1].toUpperCase() === soma[3].toUpperCase())
          somaFormulas.push({ ref: `${colLetra(c)}${n}`, col: colNum(soma[1]), ini: Number(soma[2]), fim: Number(soma[4]), linha: n, gravado: v.numero });
        const rotulo = v.texto.trim().toLowerCase().replace(/[.\s]+/g, " ").trim();
        if (["total", "dbto auto", "banco"].includes(rotulo)) rotulos[rotulo] = { ref: `${colLetra(c + 1)}${n}`, v: valor(c + 1, n), linha: n };
      });
    });

    for (const s of somaFormulas) {
      let refeita = 0;
      const textos: string[] = [];
      for (let l = s.ini; l <= s.fim; l++) {
        const v = valor(s.col, l);
        if (v.numero !== null) refeita += v.numero;
        else if (v.texto.trim() && /\d/.test(v.texto)) textos.push(`${colLetra(s.col)}${l} ("${v.texto.trim()}")`);
      }
      achados.push(
        s.gravado !== null && Math.abs(refeita - s.gravado) > CENTAVO
          ? `DIVERGÊNCIA: ${onde(s.ref)} =SUM(${colLetra(s.col)}${s.ini}:${colLetra(s.col)}${s.fim}) mostra ${reais(s.gravado)}, mas a soma refeita das linhas dá ${reais(refeita)} (diferença ${reais(s.gravado - refeita)}).`
          : `OK: ${onde(s.ref)} =SUM(${colLetra(s.col)}${s.ini}:${colLetra(s.col)}${s.fim}) = ${reais(refeita)}, soma refeita confere.`
      );
      if (textos.length) achados.push(`ATENÇÃO: ${onde(s.ref)} — valores digitados como texto não entram na soma: ${textos.join(", ")}.`);
      // Linhas com valor na mesma coluna, acima do total, mas fora do intervalo da fórmula.
      const fora: string[] = [];
      for (let l = 1; l < s.linha; l++) {
        if (l >= s.ini && l <= s.fim) continue;
        const v = valor(s.col, l);
        if (v.numero !== null && !v.formula) fora.push(`${colLetra(s.col)}${l} (${reais(v.numero)})`);
      }
      if (fora.length) achados.push(`ERRO DE FÓRMULA: ${onde(s.ref)} — há valores na coluna fora do intervalo somado: ${fora.join(", ")}.`);
    }

    // Fluxo: débito automático e banco.
    const total = rotulos["total"];
    if (total?.v.numero !== null && total) {
      const colValor = colNum(total.ref.replace(/\d+/g, ""));
      const soma = somaFormulas.find((s) => s.ref === total.ref);
      let debitos = 0;
      const linhasDebito: string[] = [];
      if (soma)
        for (let l = soma.ini; l <= soma.fim; l++) {
          const textoLinha = (aba.getRow(l).values as unknown[]).map((x) => ler({ value: x } as ExcelJS.Cell).texto).join(" ");
          const v = valor(colValor, l).numero;
          if (v !== null && /d[eé]b(ito)?\.?\s*aut|dbto\.?\s*aut/i.test(textoLinha)) {
            debitos += Math.abs(v);
            linhasDebito.push(`linha ${l} (${reais(Math.abs(v))})`);
          }
        }
      const dbto = rotulos["dbto auto"];
      if (dbto?.v.numero !== null && dbto) {
        const diferenca = Math.abs(dbto.v.numero) - debitos;
        achados.push(
          Math.abs(diferenca) > CENTAVO
            ? `DIVERGÊNCIA: ${onde(dbto.ref)} "Dbto Auto" = ${reais(Math.abs(dbto.v.numero))}${dbto.v.formula ? ` (fórmula =${dbto.v.formula})` : " (digitado)"}, mas as linhas marcadas como débito automático somam ${reais(debitos)} [${linhasDebito.join(", ") || "nenhuma linha"}]. Confirme quais lançamentos são débito automático.`
            : `OK: ${onde(dbto.ref)} "Dbto Auto" = ${reais(debitos)}${dbto.v.formula ? "" : " (digitado, confere com as linhas de débito automático)"}.`
        );
      }
      const banco = rotulos["banco"];
      if (banco?.v.numero !== null && banco) {
        const vBanco = Math.abs(banco.v.numero);
        const vTotal = Math.abs(total.v.numero ?? 0);
        const esperado = vTotal - Math.abs(dbto?.v.numero ?? 0);
        const como = banco.v.formula ? ` (fórmula =${banco.v.formula})` : " (digitado)";
        if (Math.abs(vBanco - esperado) <= CENTAVO) achados.push(`OK: ${onde(banco.ref)} "Banco" = Total − Dbto Auto = ${reais(esperado)}${como}.`);
        else if (Math.abs(vBanco - vTotal) <= CENTAVO)
          achados.push(`ATENÇÃO (critério): ${onde(banco.ref)} "Banco" = ${reais(vBanco)}${como} é igual ao Total, ou seja, inclui os débitos automáticos (${reais(Math.abs(dbto?.v.numero ?? 0))}). No padrão Banco = Total − Dbto Auto seria ${reais(esperado)}. Confirme qual critério o financeiro usa.`);
        else
          achados.push(`DIVERGÊNCIA: ${onde(banco.ref)} "Banco" = ${reais(vBanco)}${como} não bate nem com Total − Dbto Auto (${reais(esperado)}, diferença ${reais(vBanco - esperado)}) nem com o Total (${reais(vTotal)}, diferença ${reais(vBanco - vTotal)}).`);
      }

      // Contas auxiliares nas linhas do fluxo (ex.: ISS = receita × alíquota) × valor lançado na mesma linha.
      if (soma)
        for (let l = soma.ini; l <= soma.fim; l++) {
          const lancado = valor(colValor, l).numero;
          if (lancado === null) continue;
          aba.getRow(l).eachCell({ includeEmpty: false }, (celula, c) => {
            const v = ler(celula);
            if (c === colValor || !v.formula || v.numero === null) return;
            const diferenca = Math.abs(lancado) - Math.abs(v.numero);
            const linhaTexto = (aba.getRow(l).values as unknown[]).map((x) => ler({ value: x } as ExcelJS.Cell).texto).filter((x) => x && !/^-?d/.test(x)).slice(0, 3).join(" · ");
            achados.push(
              `${Math.abs(diferenca) > CENTAVO ? "DIFERENÇA" : "OK"}: ${onde(`${colLetra(c)}${l}`)} — conta auxiliar =${v.formula} = ${reais(Math.abs(v.numero))} × valor lançado no fluxo ${reais(Math.abs(lancado))} (${linhaTexto}); diferença ${reais(diferenca)}. Confirme o valor pela guia/documento.`
            );
          });
        }
    }
  });
  return achados;
}
