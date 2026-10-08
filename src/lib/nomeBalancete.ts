// Nome do arquivo do balancete → academia, mês e ano (usado na tela, antes de enviar o arquivo).

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Ex.: (ex.: "Novo Osasco 08 2026.xlsx", "KM18 agosto 2026.xlsx", "Continental 08-2026").
export function interpretarNome(nome: string, academias: { id: string; nome: string }[]) {
  const base = semAcento(nome.replace(/\.[^.]+$/, "")).replace(/[_]+/g, " ");
  const compacto = base.replace(/[^a-z0-9]/g, "");
  const academia = academias.find((a) => compacto.includes(semAcento(a.nome).replace(/[^a-z0-9]/g, "")));
  const ano = base.match(/(20\d{2})/)?.[1];
  let resto = base.replace(/20\d{2}/, " ");
  if (academia) resto = resto.replace(new RegExp(semAcento(academia.nome).replace(/[^a-z0-9]+/g, "[^a-z0-9]*"), "i"), " ");
  let mes = MESES.findIndex((m) => new RegExp(`\\b${m}[a-z]*`).test(resto)) + 1;
  if (!mes) {
    const n = resto.match(/\b(0?[1-9]|1[0-2])\b/)?.[1];
    if (n) mes = Number(n);
  }
  return { academiaId: academia?.id ?? null, ano: ano ? Number(ano) : null, mes: mes || null };
}

const NOMES_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeMes = (m: number) => NOMES_MESES[m - 1];
// "agosto/2026" ou "janeiro a julho/2026".
export function rotuloPeriodo(mesInicio: number, mesFim: number, ano: number) {
  return mesInicio === mesFim ? `${NOMES_MESES[mesInicio - 1]}/${ano}` : `${NOMES_MESES[mesInicio - 1]} a ${NOMES_MESES[mesFim - 1]}/${ano}`;
}
