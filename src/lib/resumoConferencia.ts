// Resumo de um relatório da conferência de pagamentos (markdown), para a lista dos lotes semanais.

// Período do fluxo no título do relatório: "# Conferência de pagamentos — KM18 · outubro/2026 (fluxo de 08/10 a 16/10)".
export function periodoDoFluxo(relatorio: string | null) {
  const titulo = (relatorio ?? "").split("\n").find((l) => l.startsWith("# ")) ?? "";
  const m = titulo.match(/(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?\s*(?:a|até|-|–)\s*(\d{1,2}\/\d{1,2})/i);
  return m ? { inicio: m[1].padStart(5, "0"), fim: m[2].padStart(5, "0") } : null;
}

// Valores de LIBERAR / SEGURAR / CORRIGIR da decisão executiva (o total é o último valor da linha da tabela).
export function decisaoDoRelatorio(relatorio: string | null) {
  const valor = (rotulo: string) => {
    const linha = (relatorio ?? "").split("\n").find((l) => l.startsWith("|") && l.toUpperCase().includes(`**${rotulo}`));
    const total = linha?.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g)?.pop();
    return total ? `R$ ${total}` : null;
  };
  return { liberar: valor("LIBERAR"), segurar: valor("SEGURAR"), corrigir: valor("CORRIGIR") };
}

export function resumoDaDecisao(relatorio: string | null) {
  const d = decisaoDoRelatorio(relatorio);
  const partes = [
    ["Liberar", d.liberar],
    ["Segurar", d.segurar],
  ]
    .filter(([, v]) => v)
    .map(([r, v]) => `${r} ${v}`);
  return partes.length ? partes.join(" · ") : "—";
}
