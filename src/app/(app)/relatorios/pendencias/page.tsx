import { contextoAcademias } from "@/lib/contexto";
import { TIPOS_MANUTENCAO, type Compra, type Manutencao } from "@/lib/database.types";
import { atrasada, carregarPendencias, diasEmAberto } from "@/lib/pendencias";
import { hoje } from "@/lib/planilha";
import { AbasAcademias } from "../../AbasAcademias";
import { SemAcademias } from "../../SemAcademias";
import { CabecalhoRelatorio, formatarDia, numero, TabelaRelatorio, type ColunaRelatorio } from "../comum";
import { enviarPendencias } from "./actions";
import { BotaoEnviarEmail } from "./BotaoEnviarEmail";

// Relatório de compras e manutenção: o que está em aberto em cada academia (da mais antiga para a mais
// nova) e o envio por e-mail do PDF para os usuários da academia e o administrador.
export default async function RelatorioComprasManutencaoPage({
  searchParams,
}: {
  searchParams: Promise<{ academia?: string }>;
}) {
  const { academia } = await searchParams;
  const { supabase, academias, selecionada, admin } = await contextoAcademias(academia);
  const { compras, manutencoes } = await carregarPendencias(supabase, selecionada);
  const dataHoje = hoje();
  const nome = new Map(academias.map((a) => [a.id, a.nome]));
  const nomeSelecionada = selecionada ? nome.get(selecionada) : null;

  const colunaAcademia = <T extends { academia_id: string }>(): ColunaRelatorio<T>[] =>
    selecionada ? [] : [{ rotulo: "Academia", valor: (l) => nome.get(l.academia_id) ?? "—", alinhar: "esquerda", destaque: true }];

  const colunasCompras: ColunaRelatorio<Compra>[] = [
    ...colunaAcademia<Compra>(),
    { rotulo: "Solicitada em", valor: (c) => formatarDia(c.data_solicitacao) },
    { rotulo: "O que é a compra", valor: (c) => c.descricao, alinhar: "esquerda" },
    { rotulo: "Necessário para", valor: (c) => (c.necessario_ate ? formatarDia(c.necessario_ate) : "—") },
    { rotulo: "Dias em aberto", valor: (c) => numero(diasEmAberto(c.data_solicitacao, dataHoje)) },
    {
      rotulo: "Situação",
      valor: (c) => (atrasada(c, dataHoje) ? <span className="font-semibold text-red-700">Atrasada</span> : "No prazo"),
    },
  ];
  const colunasManutencoes: ColunaRelatorio<Manutencao>[] = [
    ...colunaAcademia<Manutencao>(),
    { rotulo: "Tipo", valor: (m) => TIPOS_MANUTENCAO[m.tipo], alinhar: "esquerda" },
    { rotulo: "Incluída em", valor: (m) => formatarDia(m.data_inclusao) },
    { rotulo: "O que é a manutenção", valor: (m) => m.descricao, alinhar: "esquerda" },
    { rotulo: "Dias em aberto", valor: (m) => numero(diasEmAberto(m.data_inclusao, dataHoje)) },
  ];

  return (
    <div>
      <CabecalhoRelatorio
        titulo={`Compras e manutenção pendentes${nomeSelecionada ? ` · ${nomeSelecionada}` : ""}`}
        periodo={`Situação em ${formatarDia(dataHoje)}`}
      />

      {academias.length === 0 ? (
        <SemAcademias admin={admin} />
      ) : (
        <>
          <div className="print:hidden">
            <AbasAcademias academias={academias} selecionada={selecionada} caminho="/relatorios/pendencias" />
          </div>

          <div className="mb-4">
            {selecionada ? (
              <BotaoEnviarEmail
                enviar={enviarPendencias.bind(null, selecionada)}
                rotulo={`Enviar por e-mail (${nomeSelecionada})`}
                confirmacao={`Enviar o PDF das pendências de ${nomeSelecionada} para os usuários da academia e o administrador?`}
              />
            ) : (
              admin && (
                <BotaoEnviarEmail
                  enviar={enviarPendencias.bind(null, null)}
                  rotulo="Enviar por e-mail para todas as academias"
                  confirmacao="Enviar um e-mail para cada academia, com o PDF das pendências dela, aos usuários da academia e ao administrador?"
                />
              )
            )}
            <p className="mt-1 text-xs text-slate-500 print:hidden">
              O e-mail leva um PDF com as compras e manutenções pendentes e vai para os usuários ativos da academia e para
              os administradores.
            </p>
          </div>

          <h2 className="mb-2 text-sm font-semibold text-slate-900">Compras pendentes ({numero(compras.length)})</h2>
          <TabelaRelatorio colunas={colunasCompras} linhas={compras} chave={(c) => c.id} vazio="Nenhuma compra pendente." />
          <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-900">
            Manutenções pendentes ({numero(manutencoes.length)})
          </h2>
          <TabelaRelatorio
            colunas={colunasManutencoes}
            linhas={manutencoes}
            chave={(m) => m.id}
            vazio="Nenhuma manutenção pendente."
          />
        </>
      )}
    </div>
  );
}
