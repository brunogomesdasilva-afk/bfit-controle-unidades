import { proximoDiaUtil } from "@/lib/diasUteis";
import { hoje, texto } from "@/lib/planilha";

// Títulos a pagar de uma nota fiscal, um por parcela: usado pela tela Importar NF e pelo robô das notas do Google
// Drive. Vencimento fora de dia útil vai para o próximo; as retenções ficam só na 1ª parcela (são da nota inteira).
export type NotaParaTitulos = {
  academiaId: string;
  pessoaId: string;
  categoriaId: string;
  contaId: string | null;
  documento: string;
  descricao: string;
  observacoes: string;
  retencoes: Record<string, number>;
  parcelas: { vencimento: string; valor: number }[];
  anexo: string | null;
  criadoPor: string | null;
};

export function titulosDaNota(n: NotaParaTitulos, feriados: Set<string>) {
  const grupo = n.parcelas.length > 1 ? crypto.randomUUID() : null;
  return n.parcelas.map((p, i) => {
    const venc = proximoDiaUtil(p.vencimento, feriados);
    return {
      tipo: "pagar",
      academia_id: n.academiaId,
      pessoa_id: n.pessoaId,
      categoria_id: n.categoriaId,
      conta_id: n.contaId || null,
      descricao: texto(n.descricao, 300),
      documento: texto(n.documento, 60),
      data_registro: hoje(),
      vencimento: venc,
      previsao: venc,
      valor: p.valor,
      parcela: i + 1,
      parcelas: n.parcelas.length,
      grupo_parcelas: grupo,
      observacoes: texto(n.observacoes, 1000),
      anexo: n.anexo,
      ...(i === 0 ? n.retencoes : {}),
      criado_por: n.criadoPor,
    };
  });
}
