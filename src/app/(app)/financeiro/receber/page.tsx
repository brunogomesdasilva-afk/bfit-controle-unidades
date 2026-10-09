import { TelaTitulos } from "../titulos/TelaTitulos";

// Financeiro > Contas a receber.
export default function ContasReceberPage({ searchParams }: PageProps<"/financeiro/receber">) {
  return <TelaTitulos tipo="receber" searchParams={searchParams} />;
}
