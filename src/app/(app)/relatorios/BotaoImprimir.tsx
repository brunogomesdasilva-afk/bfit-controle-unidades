"use client";

// Abre a impressão do navegador; lá dá para escolher "Salvar como PDF".
// Menu, filtros e botões somem na impressão (classes "print:hidden").
export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-marca px-3 py-2 text-sm font-medium text-white hover:bg-marca-escuro print:hidden"
    >
      Salvar em PDF / Imprimir
    </button>
  );
}
