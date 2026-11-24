import { getPerfilAtual } from "@/lib/auth";
import { processarPdfDoNavegador } from "@/lib/nfDrive";
import { createAdminClient } from "@/lib/supabase/admin";

// Importar NF > "Importar uma pasta": recebe um PDF da pasta escolhida no navegador e passa pelo robô das notas
// (lê, cadastra o fornecedor, lança no contas a pagar). Responde o que aconteceu e, se lançou, para onde o
// navegador deve mover o arquivo. Categoria e vencimento informados na tela vêm junto quando a nota estava pendente.
export const maxDuration = 120;

const LIMITE = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const atual = await getPerfilAtual();
  if (!atual || atual.perfil !== "admin") return Response.json({ erro: "Só o administrador importa uma pasta de notas." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return Response.json({ erro: "Envie o PDF da nota." }, { status: 400 });
  if (arquivo.size > LIMITE) return Response.json({ erro: "O PDF passa de 4 MB." }, { status: 400 });
  const db = createAdminClient();
  if (!db) return Response.json({ erro: "Chave de serviço do Supabase não configurada." }, { status: 500 });
  const texto = (k: string) => {
    const v = form?.get(k);
    return typeof v === "string" && v ? v : undefined;
  };
  const r = await processarPdfDoNavegador(
    db,
    { nome: arquivo.name, modificado: texto("modificado") ?? new Date(arquivo.lastModified).toISOString(), pdf: await arquivo.arrayBuffer() },
    { criadoPor: atual.id, complementos: { categoriaId: texto("categoriaId"), vencimento: texto("vencimento") } }
  );
  return Response.json(r);
}
