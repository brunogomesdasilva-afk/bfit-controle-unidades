import Anthropic from "@anthropic-ai/sdk";
import { aulasDoMes } from "@/lib/aulasDoMes";
import { getPerfilAtual, temModulo } from "@/lib/auth";
import { excelParaTexto } from "@/lib/excelTexto";
import { PROMPT_MESTRE, REGRAS_DO_SISTEMA } from "@/lib/promptConferencia";
import { nomeDoMes } from "@/app/(app)/relatorios/comum";
import { createClient } from "@/lib/supabase/server";

// Conferência da folha pelo Claude: recebe os arquivos já enviados para a pasta "folha" do armazenamento,
// junta os dados do sistema (aulas do mês pela grade, cadastro dos professores, folhas fechadas anteriores) e
// devolve o relatório em texto, aos poucos (a tela mostra enquanto ele é escrito). O relatório é gravado em
// folha_conferencias, inclusive o parcial se a conferência for interrompida.

// A conferência pode levar alguns minutos (leitura dos PDFs, cálculos e pesquisa das tabelas oficiais).
export const maxDuration = 300;

const MODELO = "claude-opus-5-5";
const TIPOS_ARQUIVO = { folha: "Folha de pagamento", ponto: "Relatório de ponto", vt: "Controle de vale-transporte" } as const;
type TipoArquivo = keyof typeof TIPOS_ARQUIVO;
type Arquivo = { tipo: TipoArquivo; nome: string; caminho: string };

const erro = (mensagem: string, status = 400) => new Response(mensagem, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

async function blocoDoArquivo(a: Arquivo, dados: ArrayBuffer): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const titulo = `${TIPOS_ARQUIVO[a.tipo]} (arquivo "${a.nome}")`;
  const ext = a.nome.toLowerCase().split(".").pop() ?? "";
  const base64 = Buffer.from(dados).toString("base64");
  if (ext === "pdf") return [{ type: "document", title: titulo, source: { type: "base64", media_type: "application/pdf", data: base64 } }];
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
    const tipo = ext === "jpg" ? "jpeg" : ext;
    return [
      { type: "text", text: `Imagem a seguir: ${titulo}` },
      { type: "image", source: { type: "base64", media_type: `image/${tipo}` as "image/png", data: base64 } },
    ];
  }
  const textoPlano = ["xlsx", "xlsm"].includes(ext) ? await excelParaTexto(dados) : new TextDecoder("utf-8").decode(dados);
  return [{ type: "document", title: titulo, source: { type: "text", media_type: "text/plain", data: textoPlano } }];
}

export async function POST(request: Request) {
  const atual = await getPerfilAtual();
  if (!atual) return erro("Sua sessão expirou. Entre novamente.", 401);
  if (!temModulo(atual, "rh")) return erro("Você não tem o módulo RH.", 403);
  if (!process.env.ANTHROPIC_API_KEY) return erro("A chave da API da Anthropic (ANTHROPIC_API_KEY) não está configurada no servidor.", 500);

  const corpo = (await request.json().catch(() => null)) as { academia?: string; mes?: string; arquivos?: Arquivo[] } | null;
  const academiaId = String(corpo?.academia ?? "");
  const mes = String(corpo?.mes ?? "");
  const arquivos = (corpo?.arquivos ?? []).filter(
    (a) => a && a.tipo in TIPOS_ARQUIVO && typeof a.caminho === "string" && a.caminho.startsWith(`${academiaId}/${mes}/`)
  );
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return erro("Mês inválido.");
  if (!arquivos.length) return erro("Envie pelo menos a folha de pagamento.");

  const supabase = await createClient();
  // A regra de acesso do banco só devolve a academia para quem pode vê-la.
  const { data: academia } = await supabase.from("academias").select("id, nome").eq("id", academiaId).maybeSingle();
  if (!academia) return erro("Academia não encontrada.", 404);
  const { data: fechada } = await supabase
    .from("folha_conferencias")
    .select("id")
    .eq("academia_id", academiaId)
    .eq("mes", mes)
    .eq("status", "fechada")
    .maybeSingle();
  if (fechada) return erro("A folha deste mês já está fechada. Para conferir de novo, peça a quem tem o módulo ADM para reabri-la.");

  // Dados do sistema que vão junto: aulas do mês, cadastro dos professores e folhas fechadas anteriores.
  const [aulas, { data: funcionarios }, { data: anteriores }] = await Promise.all([
    aulasDoMes(supabase, academiaId, mes),
    supabase.from("funcionarios").select("nome, departamento, pj, valor_hora, isento_ponto, data_contratacao, ativo").eq("academia_id", academiaId).order("nome"),
    supabase
      .from("folha_conferencias")
      .select("mes, relatorio, fechada_em")
      .eq("academia_id", academiaId)
      .eq("status", "fechada")
      .lt("mes", mes)
      .order("mes", { ascending: false })
      .limit(3),
  ]);
  const dadosSistema = {
    academia: academia.nome,
    competencia: mes,
    aulas,
    funcionarios: funcionarios ?? [],
    folhas_fechadas_anteriores: (anteriores ?? []).map((a) => ({ mes: a.mes, fechada_em: a.fechada_em, relatorio: String(a.relatorio ?? "").slice(0, 30000) })),
  };

  const { data: conferencia, error: erroInsert } = await supabase
    .from("folha_conferencias")
    .insert({ academia_id: academiaId, mes, arquivos, dados_sistema: dadosSistema, modelo: MODELO, criado_por: atual.id })
    .select("id")
    .single();
  if (erroInsert || !conferencia) return erro(`Não foi possível registrar a conferência: ${erroInsert?.message ?? ""}`, 500);
  const id = conferencia.id as string;

  // Arquivos: baixados da pasta "folha" com o acesso de quem está conferindo.
  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
  const faltando: string[] = [];
  for (const tipo of Object.keys(TIPOS_ARQUIVO) as TipoArquivo[]) {
    const a = arquivos.find((x) => x.tipo === tipo);
    if (!a) {
      faltando.push(TIPOS_ARQUIVO[tipo]);
      continue;
    }
    const { data: blob, error: erroDownload } = await supabase.storage.from("folha").download(a.caminho);
    if (erroDownload || !blob) {
      await supabase.from("folha_conferencias").update({ status: "erro", erro: `Não foi possível ler ${a.nome}` }).eq("id", id);
      return erro(`Não foi possível ler o arquivo ${a.nome}: ${erroDownload?.message ?? ""}`, 500);
    }
    conteudo.push(...(await blocoDoArquivo(a, await blob.arrayBuffer())));
  }
  conteudo.push({
    type: "text",
    text: [
      `Faça a conferência da folha de pagamento da academia ${academia.nome}, competência ${nomeDoMes(mes)} (${mes}).`,
      faltando.length ? `Arquivos NÃO enviados nesta conferência: ${faltando.join(", ")}.` : "Foram enviados os três arquivos: folha, ponto e vale-transporte.",
      `Data de hoje: ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
      "DADOS DO SISTEMA (JSON):",
      JSON.stringify(dadosSistema),
    ].join("\n\n"),
  });

  const client = new Anthropic();
  const codificador = new TextEncoder();
  let relatorio = "";
  let gravadoEm = Date.now();
  const gravarParcial = () => {
    if (Date.now() - gravadoEm < 8000) return;
    gravadoEm = Date.now();
    void supabase.from("folha_conferencias").update({ relatorio }).eq("id", id);
  };

  const resposta = new ReadableStream<Uint8Array>({
    async start(controller) {
      const escrever = (t: string) => {
        relatorio += t;
        controller.enqueue(codificador.encode(t));
        gravarParcial();
      };
      const mensagens: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: conteudo }];
      let modelo = MODELO;
      try {
        // A pesquisa na internet roda no servidor da Anthropic; se ela pausar o turno, continua de onde parou.
        for (let rodada = 0; rodada < 5; rodada++) {
          const stream = client.beta.messages.stream({
            model: MODELO,
            max_tokens: 64000,
            thinking: { type: "adaptive" },
            output_config: { effort: "high" },
            system: [{ type: "text", text: `${PROMPT_MESTRE}\n\n${REGRAS_DO_SISTEMA}`, cache_control: { type: "ephemeral" } }],
            tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
            betas: ["server-side-fallback-2026-07-01"],
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
          if (final.stop_reason === "refusal") escrever("\n\n> A conferência foi interrompida pelo filtro de segurança do modelo. Tente de novo.");
          if (final.stop_reason === "max_tokens") escrever("\n\n> O relatório atingiu o tamanho máximo e pode estar incompleto.");
          break;
        }
        await supabase.from("folha_conferencias").update({ status: "conferida", relatorio, modelo }).eq("id", id);
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
        await supabase.from("folha_conferencias").update({ status: "erro", relatorio, erro: mensagem }).eq("id", id);
      }
      controller.close();
    },
  });

  return new Response(resposta, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Conferencia-Id": id },
  });
}
