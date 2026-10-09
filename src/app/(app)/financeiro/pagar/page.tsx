import { TelaTitulos } from "../titulos/TelaTitulos";

// Financeiro > Contas a pagar.
export default function ContasPagarPage({ searchParams }: PageProps<"/financeiro/pagar">) {
  return <TelaTitulos tipo="pagar" searchParams={searchParams} />;
}
