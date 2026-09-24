import { contextoAcademias } from "@/lib/contexto";
import { TIPOS_MANUTENCAO, type Compra, type Manutencao } from "@/lib/database.types";
import { atrasada, carregarPendencias, diasEmAberto } from "@/lib/pendencias";
import { hoje } from "@/lib/planilha";
import { AbasAcademias } from "../../AbasAcademias";
import { SemAcademias } from "../../SemAcademias";
import { CabecalhoRelatorio, formatarDia, numero, TabelaRelatorio, type ColunaRelatorio } from "../comum";
import { enviarPendencias } from "./actions";
import { BotaoEnviarEmail } from "./BotaoEnviarEmail";

// Relatório de compras e manutenção: o que está em aberto, separado por unidade e, dentro de cada
// unidade, compras e manutenções (da mais antiga para a mais nova). Cada unidade tem o envio por e-mail
// do PDF para os usuários dela e o administrador.
export default async function RelatorioComprasManutencaoPage({
  searchParams,
}: {
  searchParams: Promise<{ academia?: string }>;
}) {
  const { academia } = await searchParams;
  const { supabase, academias, selecionada, admin, atual } = await contextoAcademias(academia);
  const { compras, manutencoes } = await carregarPendencias(supabase, selecionada);
  const dataHoje = hoje();
  const unidades = selecionada ? academias.filter((a) => a.id === selecionada) : academias;

  const colunasCompras: ColunaRelatorio<Compra>[] = [
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
    { rotulo: "Tipo", valor: (m) => TIPOS_MANUTENCAO[m.tipo], alinhar: "esquerda" },
    { rotulo: "Incluída em", valor: (m) => formatarDia(m.data_inclusao) },
    { rotulo: "O que é a manutenção", valor: (m) => m.descricao, alinhar: "esquerda" },
    { rotulo: "Dias em aberto", valor: (m) => numero(diasEmAberto(m.data_inclusao, dataHoje)) },
  ];

  return (
    <div>
      <CabecalhoRelatorio titulo="Compras e manutenção pendentes" periodo={`Situação em ${formatarDia(dataHoje)}`} />

      {academias.length === 0 ? (
        <SemAcademias admin={admin} />
      ) : (
        <>
          <div className="print:hidden">
            <AbasAcademias academias={academias} selecionada={selecionada} caminho="/relatorios/pendencias" />
          </div>

          {!selecionada && admin && (
            <div className="mb-5">
              <BotaoEnviarEmail
                enviar={enviarPendencias.bind(null, null)}
                rotulo="Enviar por e-mail para todas as unidades"
                confirmacao="Enviar um e-mail para cada unidade, com o PDF das pendências dela, aos usuários da unidade e ao administrador?"
              />
            </div>
          )}

          <div className="space-y-8">
            {unidades.map((unidade) => {
              const comprasDaUnidade = compras.filter((c) => c.academia_id === unidade.id);
              const manutencoesDaUnidade = manutencoes.filter((m) => m.academia_id === unidade.id);
              const atrasadas = comprasDaUnidade.filter((c) => atrasada(c, dataHoje)).length;
              const podeEnviar = admin || atual?.academiaId === unidade.id;
              return (
                <section key={unidade.id} className="break-inside-avoid-page rounded-lg border border-slate-200 bg-white p-4 print:border-0 print:p-0">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">{unidade.nome}</h2>
                      <p className="text-sm text-slate-600">
                        {numero(comprasDaUnidade.length)} {comprasDaUnidade.length === 1 ? "compra pendente" : "compras pendentes"}
                        {atrasadas > 0 && <span className="font-semibold text-red-700"> ({atrasadas} atrasada{atrasadas > 1 ? "s" : ""})</span>}
                        {" · "}
                        {numero(manutencoesDaUnidade.length)}{" "}
                        {manutencoesDaUnidade.length === 1 ? "manutenção pendente" : "manutenções pendentes"}
                      </p>
                    </div>
                    {podeEnviar && (
                      <BotaoEnviarEmail
                        enviar={enviarPendencias.bind(null, unidade.id)}
                        rotulo="Enviar por e-mail"
                        confirmacao={`Enviar o PDF das pendências de ${unidade.nome} para os usuários da unidade e o administrador?`}
                      />
                    )}
                  </div>

                  <h3 className="mb-2 text-sm font-semibold text-marca">Compras</h3>
                  <TabelaRelatorio
                    colunas={colunasCompras}
                    linhas={comprasDaUnidade}
                    chave={(c) => c.id}
                    vazio="Nenhuma compra pendente."
                  />

                  <h3 className="mb-2 mt-5 text-sm font-semibold text-marca">Manutenção</h3>
                  <TabelaRelatorio
                    colunas={colunasManutencoes}
                    linhas={manutencoesDaUnidade}
                    chave={(m) => m.id}
                    vazio="Nenhuma manutenção pendente."
                  />
                </section>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500 print:hidden">
            O e-mail leva um PDF com as compras e manutenções pendentes da unidade e vai para os usuários ativos dela e para
            os administradores.
          </p>
        </>
      )}
    </div>
  );
}
