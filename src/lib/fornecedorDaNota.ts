import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarCnpj } from "@/lib/consultaCnpj";
import type { NotaLida } from "@/lib/lerNotaFiscal";

// Fornecedor (emitente) de uma nota fiscal, usado pelo Importar NF e pelo robô das notas:
// - não existe: é incluído com o CNPJ e os dados da nota e da Receita (razão social, fantasia, regime, CNAE e
//   endereço), como fornecedor;
// - já existe com o cadastro incompleto: os campos vazios são preenchidos com esses dados (os que já estão
//   preenchidos não mudam).
// Nomes sempre em maiúsculas. A categoria padrão não vem da nota: é escolhida na tela e fica gravada no cadastro.

export type FornecedorNota = { id: string; razao_social: string; nome_fantasia: string | null; categoria_padrao_id: string | null; regime_tributario: string | null; novo: boolean };

const CAMPOS = ["nome_fantasia", "regime_tributario", "cnae", "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "email", "telefone"] as const;
const maiusculas = (s: string | null | undefined) => (s ? s.toLocaleUpperCase("pt-BR") : null);

async function dadosDaNotaEReceita(nota: NotaLida) {
  const doc = nota.emitente.documento.replace(/\D/g, "");
  const receita = doc.length === 14 ? await consultarCnpj(doc) : null;
  const r = receita && !("erro" in receita) ? receita : null;
  const [cidade, uf] = r?.municipio.split("/") ?? [];
  return {
    documento: doc || null,
    razao_social: maiusculas(r?.razao_social ?? nota.emitente.razao_social) ?? "FORNECEDOR",
    dados: {
      nome_fantasia: maiusculas(r?.nome_fantasia ?? nota.emitente.nome_fantasia),
      regime_tributario: r ? (r.mei.optante ? "MEI" : r.simples.optante ? "Simples Nacional" : null) : null,
      cnae: r?.cnae_principal ?? null,
      cep: r?.endereco.cep ?? null,
      logradouro: r?.endereco.logradouro ?? null,
      numero: r?.endereco.numero ?? null,
      complemento: r?.endereco.complemento ?? null,
      bairro: r?.endereco.bairro ?? null,
      cidade: cidade || nota.emitente.municipio || null,
      uf: (uf || nota.emitente.uf || "").toUpperCase().slice(0, 2) || null,
      email: r?.endereco.email ?? null,
      telefone: r?.endereco.telefone ?? null,
    } as Record<(typeof CAMPOS)[number], string | null>,
  };
}

export async function fornecedorDaNota(db: SupabaseClient, nota: NotaLida): Promise<FornecedorNota> {
  const doc = nota.emitente.documento.replace(/\D/g, "");
  const { data: existente } = doc ? await db.from("fin_pessoas").select(`id, razao_social, categoria_padrao_id, fornecedor, ${CAMPOS.join(", ")}`).eq("documento", doc).maybeSingle() : { data: null };

  if (existente) {
    const atual = existente as unknown as Record<string, string | boolean | null> & { id: string; razao_social: string; categoria_padrao_id: string | null };
    const faltando = CAMPOS.filter((c) => !atual[c]);
    const mudar: Record<string, string | boolean> = {};
    if (faltando.length) {
      const { dados } = await dadosDaNotaEReceita(nota);
      for (const c of faltando) if (dados[c]) mudar[c] = dados[c]!;
    }
    if (!atual.fornecedor) mudar.fornecedor = true;
    if (Object.keys(mudar).length) await db.from("fin_pessoas").update(mudar).eq("id", atual.id);
    return {
      id: atual.id,
      razao_social: atual.razao_social,
      nome_fantasia: (mudar.nome_fantasia as string | undefined) ?? (atual.nome_fantasia as string | null),
      categoria_padrao_id: atual.categoria_padrao_id,
      regime_tributario: (mudar.regime_tributario as string | undefined) ?? (atual.regime_tributario as string | null),
      novo: false,
    };
  }

  const { documento, razao_social, dados } = await dadosDaNotaEReceita(nota);
  const { data: criado, error } = await db
    .from("fin_pessoas")
    .insert({ documento, tipo_pessoa: documento?.length === 11 ? "PF" : "PJ", razao_social, ...dados, fornecedor: true, ativo: true })
    .select("id")
    .single();
  if (error) throw new Error(`Não foi possível cadastrar o fornecedor: ${error.message}`);
  return { id: criado.id as string, razao_social, nome_fantasia: dados.nome_fantasia, categoria_padrao_id: null, regime_tributario: dados.regime_tributario, novo: true };
}
