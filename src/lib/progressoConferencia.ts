// Progresso das conferências feitas pelo Claude (folha e pagamentos). A análise leva minutos antes da primeira
// linha do relatório; nesse tempo o servidor manda etapas ("Pesquisando: tabela do INSS 2026"…) no mesmo fluxo do
// texto, cada uma numa linha marcada com o caractere \u0001. A tela separa as etapas do relatório.

export const MARCA_ETAPA = "\u0001";

export const linhaDeEtapa = (texto: string) => `${MARCA_ETAPA}${texto.replace(/\s+/g, " ").trim()}\n`;

// Separa o que chegou até agora em relatório (sem as etapas) e a última etapa.
export function separarProgresso(bruto: string) {
  const etapas = [...bruto.matchAll(/\u0001([^\n]*)\n/g)].map((m) => m[1]);
  const texto = bruto.replace(/\u0001[^\n]*\n/g, "").replace(/\u0001[^\n]*$/, "");
  return { texto, etapa: etapas.at(-1) ?? null, etapas };
}

type EventoStream = { type: string; content_block?: { type: string; name?: string } };
type Bloco = { type: string; name?: string; input?: unknown };
type StreamComEventos = {
  on(evento: "streamEvent", f: (e: EventoStream) => void): unknown;
  on(evento: "contentBlock", f: (b: Bloco) => void): unknown;
};

// Liga o stream do Claude às etapas mostradas na tela.
export function acompanharStream(stream: StreamComEventos, etapa: (texto: string) => void) {
  let escrevendo = false;
  stream.on("streamEvent", (e) => {
    if (e.type !== "content_block_start" || !e.content_block) return;
    if (e.content_block.type === "thinking") etapa("Analisando os arquivos e os dados…");
    if (e.content_block.type === "server_tool_use")
      etapa(e.content_block.name === "web_search" ? "Pesquisando na internet…" : "Fazendo os cálculos…");
    if (e.content_block.type === "text" && !escrevendo) {
      escrevendo = true;
      etapa("Escrevendo o relatório…");
    }
  });
  // A busca pode vir direto (web_search) ou de dentro do código que ele roda (code_execution chamando web_search).
  stream.on("contentBlock", (b) => {
    if (b.type !== "server_tool_use") return;
    const entrada = (b.input ?? {}) as { query?: string; code?: string };
    const consulta = entrada.query ?? entrada.code?.match(/web_search\(\{\s*["']query["']\s*:\s*["']([^"']+)/)?.[1];
    if (consulta) etapa(`Pesquisando: ${consulta}`);
  });
}
