import type { Coluna } from "../../Planilha";
import { excluirDiario, salvarDiario } from "../../lancamentos";
import { TelaMensal } from "../../TelaMensal";

// Mesma ordem da planilha "Gerencial". As colunas cinza (ICV, churn e previsão de churn) são
// calculadas pelo banco a partir dos campos do dia.
const COLUNAS: Coluna[] = [
  { campo: "data", rotulo: "Data", tipo: "data", obrigatorio: true, largura: "w-32" },
  { campo: "ativos_pagantes", rotulo: "Ativos pag.", tipo: "inteiro", largura: "w-24" },
  { campo: "visitas", rotulo: "Visitas", tipo: "inteiro", largura: "w-20" },
  { campo: "vendas", rotulo: "Vendas", tipo: "inteiro", largura: "w-20" },
  { campo: "icv", rotulo: "ICV %", tipo: "percentual", largura: "w-24" },
  { campo: "inadimplentes", rotulo: "Inadimplentes", tipo: "inteiro", largura: "w-24" },
  { campo: "faturamento", rotulo: "Faturamento", tipo: "moeda", largura: "w-32" },
  { campo: "cancelamentos_solicitados", rotulo: "Canc. solic.", tipo: "inteiro", largura: "w-20" },
  { campo: "cancelamentos_efetivados", rotulo: "Canc. efet.", tipo: "inteiro", largura: "w-20" },
  { campo: "churn", rotulo: "Churn", tipo: "percentual", largura: "w-24" },
  { campo: "previsao_churn", rotulo: "Prev. churn", tipo: "percentual", largura: "w-24" },
  { campo: "nps", rotulo: "NPS", tipo: "decimal", largura: "w-20" },
  { campo: "neoassist", rotulo: "Neoassist", tipo: "inteiro", largura: "w-20" },
  { campo: "vendas_site", rotulo: "Vendas site", tipo: "inteiro", largura: "w-20" },
];

export default function ControleDiarioPage({
  searchParams,
}: {
  searchParams: Promise<{ academia?: string; mes?: string }>;
}) {
  return (
    <TelaMensal
      searchParams={searchParams}
      titulo="Controle diário"
      descricao="Indicadores de cada dia. As colunas em cinza são automáticas: ICV, churn e previsão de churn são calculados a partir dos campos do dia."
      caminho="/vendas/diario"
      tabela="controle_diario"
      colunas={COLUNAS}
      ordem={["data"]}
      salvar={salvarDiario}
      excluir={excluirDiario}
      rotuloNovo="+ Novo dia"
    />
  );
}
