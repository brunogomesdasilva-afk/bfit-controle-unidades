import { getPerfilAtual, temModulo } from "@/lib/auth";
import { consultarCnpj } from "@/lib/consultaCnpj";
import { fornecedorDaNota } from "@/lib/fornecedorDaNota";
import { lerNotaFiscal } from "@/lib/lerNotaFiscal";
import { createClient } from "@/lib/supabase/server";

// Recebe o PDF da nota, lê com o Claude e cruza com os cadastros: de qual academia é (CNPJ do tomador), o fornecedor
// (cadastrado ou completado pelo CNPJ do emitente, com a categoria padrão dele) e se a nota já foi lançada.
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
  const { data: academias } = await supabase.from("academias").select("id, nome, cnpj");
  // Fornecedor: cadastrado agora com o CNPJ e os dados da nota e da Receita, se não existir; se existir com o
  // cadastro incompleto, os campos vazios são preenchidos. Só a categoria é escolhida na tela.
  let fornecedor = null;
  if (nota.emitente.documento) {
    try {
      const f = await fornecedorDaNota(supabase, nota);
      fornecedor = { id: f.id, razao_social: f.razao_social, nome_fantasia: f.nome_fantasia, categoria_padrao_id: f.categoria_padrao_id, regime_tributario: f.regime_tributario };
    } catch (e) {
      return Response.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
  const academia = (academias ?? []).find((a) => a.cnpj && a.cnpj === nota.tomador.documento) ?? null;
  const { data: repetidas } = fornecedor
    ? await supabase.from("fin_titulos").select("id, vencimento, valor, academia_id").eq("pessoa_id", fornecedor.id).eq("documento", nota.numero).eq("cancelado", false)
    : { data: [] };
  // Situação na Receita (aviso na tela se não estiver ativa).
  const receita = nota.emitente.documento.length === 14 ? await consultarCnpj(nota.emitente.documento) : null;

  return Response.json({
    nota,
    academia: academia ? { id: academia.id, nome: academia.nome } : null,
    fornecedor,
    receita: receita && !("erro" in receita) ? { razao_social: receita.razao_social, nome_fantasia: receita.nome_fantasia, situacao: receita.situacao_cadastral, regime: receita.mei.optante ? "MEI" : receita.simples.optante ? "Simples Nacional" : null, cnae: receita.cnae_principal, municipio: receita.municipio } : null,
    repetidas: repetidas ?? [],
  });
}
