import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { nomeDoMes } from "@/app/(app)/relatorios/comum";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { consultarCnpj } from "@/lib/consultaCnpj";
import { excelParaTexto } from "@/lib/excelTexto";
import { PROMPT_MESTRE } from "@/lib/promptConferencia";
import { REGRAS_PAGAMENTOS } from "@/lib/regrasPagamentos";
import { createClient } from "@/lib/supabase/server";

// Conferência de pagamentos pelo Claude: recebe o .zip do lote já enviado para a pasta "pagamentos" do
// armazenamento, abre os arquivos (PDF e imagem vão pela API de arquivos da Anthropic; Excel, .docx, CSV e texto
// vão como texto), junta os relatórios anteriores da academia e devolve o relatório aos poucos. O relatório é
// gravado em pagamentos_conferencias, inclusive o parcial se a conferência for interrompida.

// O lote tem dezenas de documentos: a conferência pode levar vários minutos.
export const maxDuration = 800;

const MODELO = "claude-opus-5-5";
const BETA_ARQUIVOS = "files-api-2025-04-14";
const IMAGENS: Record<string, "image/png" | "image/jpeg" | "image/webp" | "image/gif"> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

// Ferramenta que o Claude chama para ver o cadastro de cada prestador/fornecedor na Receita (regime, CNAE, situação).
const FERRAMENTA_CNPJ: Anthropic.Beta.BetaTool = {
  name: "consultar_cnpj",
  description:
    "Consulta o cadastro de um CNPJ na base pública da Receita Federal: razão social, situação cadastral, CNAE principal e secundários, natureza jurídica, porte, opção pelo Simples Nacional e pelo MEI (com datas de opção e exclusão), município e sócios. Use para todo prestador ou fornecedor com nota fiscal no lote, antes de validar as retenções.",
  input_schema: { type: "object", properties: { cnpj: { type: "string", description: "CNPJ com ou sem pontuação" } }, required: ["cnpj"] },
};

type ItemInventario = { nome: string; tipo: string; tamanho: number; paginas?: number; lido: boolean; motivo?: string };

const erro = (mensagem: string, status = 400) => new Response(mensagem, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// Arquivos de sistema que vêm junto no .zip e não fazem parte do lote.
const ignorar = (caminho: string) => {
  const nome = caminho.split("/").pop() ?? "";
  return !nome || caminho.endsWith("/") || caminho.startsWith("__MACOSX/") || nome.startsWith("._") || nome.startsWith("~$") || ["thumbs.db", "desktop.ini", ".ds_store"].includes(nome.toLowerCase());
};

// .docx: o texto dos parágrafos de word/document.xml.
function docxParaTexto(dados: Uint8Array) {
  const xml = new TextDecoder("utf-8").decode(unzipSync(dados, { filter: (f) => f.name === "word/document.xml" })["word/document.xml"]);
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

async function contarPaginas(dados: Uint8Array) {
  try {
    return (await PDFDocument.load(dados, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false })).getPageCount();
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const atual = await getPerfilAtual();
  if (!atual) return erro("Sua sessão expirou. Entre novamente.", 401);
  if (!temModulo(atual, "financeiro")) return erro("Você não tem o módulo Financeiro.", 403);
  if (!process.env.ANTHROPIC_API_KEY) return erro("A chave da API da Anthropic (ANTHROPIC_API_KEY) não está configurada no servidor.", 500);

  const corpo = (await request.json().catch(() => null)) as { academia?: string; mes?: string; nome?: string; caminho?: string } | null;
  const academiaId = String(corpo?.academia ?? "");
  const mes = String(corpo?.mes ?? "");
  const caminho = String(corpo?.caminho ?? "");
  const nomeZip = String(corpo?.nome ?? "lote.zip");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return erro("Mês inválido.");
  if (!caminho.startsWith(`${academiaId}/${mes}/`) || !caminho.endsWith(".zip")) return erro("Envie o lote em um arquivo .zip.");

  const supabase = await createClient();
  // A regra de acesso do banco só devolve a academia para quem pode vê-la.
  const { data: academia } = await supabase.from("academias").select("id, nome").eq("id", academiaId).maybeSingle();
  if (!academia) return erro("Academia não encontrada.", 404);

  const { data: blob, error: erroDownload } = await supabase.storage.from("pagamentos").download(caminho);
  if (erroDownload || !blob) return erro(`Não foi possível ler o .zip: ${erroDownload?.message ?? ""}`, 500);
  let arquivos: Record<string, Uint8Array>;
  try {
    arquivos = unzipSync(new Uint8Array(await blob.arrayBuffer()), { filter: (f) => !ignorar(f.name) });
  } catch {
    return erro("O arquivo enviado não é um .zip válido.");
  }
  // Na ordem dos nomes, respeitando a numeração do financeiro (1, 1.1, 2... 10).
  const nomes = Object.keys(arquivos).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  if (!nomes.length) return erro("O .zip está vazio.");

  const { data: anteriores } = await supabase
    .from("pagamentos_conferencias")
    .select("mes, arquivo_nome, relatorio, criado_em")
    .eq("academia_id", academiaId)
    .eq("status", "conferida")
    .order("criado_em", { ascending: false })
    .limit(3);

  const inventario: ItemInventario[] = nomes.map((n) => ({ nome: n, tipo: n.toLowerCase().split(".").pop() ?? "", tamanho: arquivos[n].length, lido: false }));
  const { data: conferencia, error: erroInsert } = await supabase
    .from("pagamentos_conferencias")
    .insert({ academia_id: academiaId, mes, arquivo_nome: nomeZip, arquivo_caminho: caminho, inventario, modelo: MODELO, criado_por: atual.id })
    .select("id")
    .single();
  if (erroInsert || !conferencia) return erro(`Não foi possível registrar a conferência: ${erroInsert?.message ?? ""}`, 500);
  const id = conferencia.id as string;

  const client = new Anthropic();
  const codificador = new TextEncoder();
  let relatorio = "";
  let gravadoEm = Date.now();
  const gravarParcial = () => {
    if (Date.now() - gravadoEm < 8000) return;
    gravadoEm = Date.now();
    void supabase.from("pagamentos_conferencias").update({ relatorio }).eq("id", id);
  };

  const resposta = new ReadableStream<Uint8Array>({
    async start(controller) {
      const escrever = (t: string) => {
        relatorio += t;
        controller.enqueue(codificador.encode(t));
        gravarParcial();
      };
      const enviados: string[] = [];
      let modelo = MODELO;
      try {
        // Cada arquivo do lote vira um bloco da mensagem. PDF e imagem sobem para a API de arquivos (o lote inteiro
        // passaria do limite de tamanho de uma mensagem); o resto vai como texto.
        const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
        for (const item of inventario) {
          const dados = arquivos[item.nome];
          const titulo = `Arquivo "${item.nome}"`;
          try {
            if (item.tipo === "pdf" || IMAGENS[item.tipo]) {
              const tipoMime = item.tipo === "pdf" ? "application/pdf" : IMAGENS[item.tipo];
              // Páginas só para o inventário: PDF que o pdf-lib não entende ainda vai para a conferência.
              if (item.tipo === "pdf") item.paginas = await contarPaginas(dados);
              const nomeArquivo = item.nome.split("/").pop() ?? item.nome;
              const enviado = await client.beta.files.upload({ file: await toFile(dados, nomeArquivo, { type: tipoMime }), betas: [BETA_ARQUIVOS] });
              enviados.push(enviado.id);
              if (item.tipo === "pdf") conteudo.push({ type: "document", title: titulo, source: { type: "file", file_id: enviado.id } });
              else conteudo.push({ type: "text", text: `Imagem a seguir: ${titulo}` }, { type: "image", source: { type: "file", file_id: enviado.id } });
            } else if (["xlsx", "xlsm", "docx", "csv", "txt", "md", "xml", "html", "htm"].includes(item.tipo)) {
              const texto =
                item.tipo === "xlsx" || item.tipo === "xlsm"
                  ? await excelParaTexto(dados.slice().buffer)
                  : item.tipo === "docx"
                    ? docxParaTexto(dados)
                    : new TextDecoder("utf-8").decode(dados);
              conteudo.push({ type: "document", title: titulo, source: { type: "text", media_type: "text/plain", data: texto || "(arquivo sem texto)" } });
            } else {
              item.motivo = "tipo de arquivo não lido pelo sistema (envie em PDF, Excel, Word ou imagem)";
              continue;
            }
            item.lido = true;
          } catch (e) {
            item.motivo = `falha na leitura: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
        await supabase.from("pagamentos_conferencias").update({ inventario }).eq("id", id);

        const listaInventario = inventario
          .map((i) => `- ${i.nome} (${i.tipo.toUpperCase()}, ${(i.tamanho / 1024).toFixed(0)} KB${i.paginas ? `, ${i.paginas} pág.` : ""})${i.lido ? "" : ` — NÃO LIDO: ${i.motivo}`}`)
          .join("\n");
        conteudo.push({
          type: "text",
          text: [
            `Faça a conferência de pagamentos da academia ${academia.nome}, mês dos vencimentos ${nomeDoMes(mes)} (${mes}). Lote: "${nomeZip}".`,
            `Data de hoje: ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
            `INVENTÁRIO DO LOTE (${inventario.length} arquivos):\n${listaInventario}`,
            anteriores?.length
              ? `RELATÓRIOS ANTERIORES DESTA ACADEMIA (mais recente primeiro):\n\n${anteriores
                  .map((a) => `=== Conferência de ${new Date(a.criado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · lote "${a.arquivo_nome}" (${a.mes}) ===\n${String(a.relatorio ?? "").slice(0, 40000)}`)
                  .join("\n\n")}`
              : "Não há conferências anteriores desta academia no sistema.",
          ].join("\n\n"),
        });

        // O lote vai em cache: nas rodadas seguintes (consultas de CNPJ, pesquisa) ele não é cobrado inteiro de novo.
        const ultimo = conteudo[conteudo.length - 1];
        if (ultimo.type === "text") ultimo.cache_control = { type: "ephemeral" };
        const mensagens: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: conteudo }];
        const consultas = new Map<string, Promise<unknown>>();
        // Rodadas: a pesquisa na internet roda na Anthropic (pode pausar o turno); a consulta de CNPJ roda aqui.
        for (let rodada = 0; rodada < 25; rodada++) {
          const stream = client.beta.messages.stream({
            model: MODELO,
            max_tokens: 64000,
            thinking: { type: "adaptive" },
            output_config: { effort: "high" },
            system: [{ type: "text", text: `${PROMPT_MESTRE}\n\n${REGRAS_PAGAMENTOS}`, cache_control: { type: "ephemeral" } }],
            tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }, FERRAMENTA_CNPJ],
            betas: ["server-side-fallback-2026-07-01", BETA_ARQUIVOS],
            fallbacks: "default",
            messages: mensagens,
          });
          stream.on("text", (delta) => escrever(delta));
          const final = await stream.finalMessage();
          modelo = final.model;
          if (final.stop_reason === "pause_turn") {
            mensagens.push({ role: "assistant", content: final.content });
            continue;
          }
          if (final.stop_reason === "tool_use") {
            mensagens.push({ role: "assistant", content: final.content });
            const pedidos = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
            const resultados = await Promise.all(
              pedidos.map(async (p) => {
                const cnpj = String((p.input as { cnpj?: string })?.cnpj ?? "").replace(/D/g, "");
                if (!consultas.has(cnpj)) consultas.set(cnpj, consultarCnpj(cnpj));
                return { type: "tool_result" as const, tool_use_id: p.id, content: JSON.stringify(await consultas.get(cnpj)) };
              })
            );
            mensagens.push({ role: "user", content: resultados });
            continue;
          }
          if (final.stop_reason === "refusal") escrever("\n\n> A conferência foi interrompida pelo filtro de segurança do modelo. Tente de novo.");
          if (final.stop_reason === "max_tokens") escrever("\n\n> O relatório atingiu o tamanho máximo e pode estar incompleto.");
          break;
        }
        await supabase.from("pagamentos_conferencias").update({ status: "conferida", relatorio, modelo }).eq("id", id);
      } catch (e) {
        const mensagem =
          e instanceof Anthropic.AuthenticationError
            ? "Chave da API da Anthropic inválida."
            : e instanceof Anthropic.RateLimitError
              ? "Limite de uso da API atingido. Tente de novo em alguns minutos."
              : e instanceof Anthropic.APIError
                ? `Erro da API da Anthropic (${e.status ?? "sem status"}): ${e.message}`
                : `Erro na conferência: ${e instanceof Error ? e.message : String(e)}`;
        escrever(`\n\n> ${mensagem}`);
        await supabase.from("pagamentos_conferencias").update({ status: "erro", relatorio, erro: mensagem, inventario }).eq("id", id);
      } finally {
        // Os arquivos ficam guardados no .zip do armazenamento; na Anthropic são apagados ao fim.
        await Promise.allSettled(enviados.map((f) => client.beta.files.delete(f, { betas: [BETA_ARQUIVOS] })));
      }
      controller.close();
    },
  });

  return new Response(resposta, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Conferencia-Id": id },
  });
}
