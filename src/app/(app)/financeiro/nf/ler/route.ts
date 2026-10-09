import { getPerfilAtual, temModulo } from "@/lib/auth";
import { consultarCnpj } from "@/lib/consultaCnpj";
import { lerNotaFiscal } from "@/lib/lerNotaFiscal";
import { createClient } from "@/lib/supabase/server";

// Recebe o PDF da nota, lê com o Claude e cruza com os cadastros: de qual academia é (CNPJ do tomador), se o
// fornecedor já está cadastrado (CNPJ do emitente, com a categoria padrão dele) e se a nota já foi lançada.
export const maxDuration = 120;

const LIMITE = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const atual = await getPerfilAtual();
  if (!atual || !temModulo(atual, "financeiro")) return Response.json({ erro: "Sem acesso ao módulo Financeiro." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return Response.json({ erro: "Envie o PDF da nota." }, { status: 400 });
  if (!/\.pdf$/i.test(arquivo.name)) return Response.json({ erro: "Envie a nota em PDF." }, { status: 400 });
  if (arquivo.size > LIMITE) return Response.json({ erro: "O PDF passa de 4 MB." }, { status: 400 });

  const { nota, erro } = await lerNotaFiscal(await arquivo.arrayBuffer());
  if (!nota) return Response.json({ erro }, { status: 422 });

  const supabase = await createClient();
  const [{ data: academias }, { data: fornecedor }] = await Promise.all([
    supabase.from("academias").select("id, nome, cnpj"),
    nota.emitente.documento ? supabase.from("fin_pessoas").select("id, razao_social, nome_fantasia, categoria_padrao_id, regime_tributario").eq("documento", nota.emitente.documento).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const academia = (academias ?? []).find((a) => a.cnpj && a.cnpj === nota.tomador.documento) ?? null;
  const { data: repetidas } = fornecedor
    ? await supabase.from("fin_titulos").select("id, vencimento, valor, academia_id").eq("pessoa_id", fornecedor.id).eq("documento", nota.numero).eq("cancelado", false)
    : { data: [] };
  // Fornecedor novo: dados da Receita para o cadastro automático.
  const receita = !fornecedor && nota.emitente.documento.length === 14 ? await consultarCnpj(nota.emitente.documento) : null;

  return Response.json({
    nota,
    academia: academia ? { id: academia.id, nome: academia.nome } : null,
    fornecedor,
    receita: receita && !("erro" in receita) ? { razao_social: receita.razao_social, nome_fantasia: receita.nome_fantasia, situacao: receita.situacao_cadastral, regime: receita.mei.optante ? "MEI" : receita.simples.optante ? "Simples Nacional" : null, cnae: receita.cnae_principal, municipio: receita.municipio } : null,
    repetidas: repetidas ?? [],
  });
}
