// Arquivos de remessa CNAB para o banco (Financeiro > Relatórios > Gerar lote para o banco).
// - Pagamentos: CNAB 240 FEBRABAN (Bradesco Multipag e demais bancos): crédito em conta Bradesco, TED, PIX por chave
//   (segmentos A e B), boletos (J e J-52) e contas/tributos com código de barras (O).
// - Cobrança: CNAB 400 do Bradesco (registro de boletos do contas a receber).
// Montado a partir do layout padrão; antes de usar de verdade, o banco valida um arquivo de teste (homologação) e
// pode pedir ajustes de versão de layout, convênio ou campos: tudo isso fica em Parâmetros CNAB.

// ------------------------------------------------------------------ Montagem das linhas
type Campo = [inicio: number, fim: number, valor: string];

// Linha de tamanho fixo com cada campo na posição do layout (posições contadas a partir de 1, como no manual).
function linha(tamanho: number, campos: Campo[]) {
  const l = Array.from({ length: tamanho }, () => " ");
  for (const [inicio, fim, valor] of campos) {
    if (valor.length !== fim - inicio + 1) throw new Error(`CNAB: campo ${inicio}-${fim} com ${valor.length} caracteres.`);
    for (let i = 0; i < valor.length; i++) l[inicio - 1 + i] = valor[i];
  }
  return l.join("");
}
const digitos = (v: string | number | null | undefined) => String(v ?? "").replace(/\D/g, "");
// Número alinhado à direita com zeros (corta à esquerda se passar).
export const num = (v: string | number | null | undefined, n: number) => digitos(v).padStart(n, "0").slice(-n);
// Texto em maiúsculas, sem acentos nem caracteres especiais, alinhado à esquerda com brancos.
export const alfa = (v: string | null | undefined, n: number) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .,/&()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .padEnd(n, " ")
    .slice(0, n);
const brancos = (n: number) => " ".repeat(n);
const zeros = (n: number) => "0".repeat(n);
const valor = (reais: number, n: number) => num(Math.round(reais * 100), n);
const data8 = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`; // DDMMAAAA
const data6 = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}`; // DDMMAA

// ------------------------------------------------------------------ Código de barras
// Converte a linha digitável (47 dígitos do boleto, 48 da guia/concessionária) para o código de barras (44).
export function codigoDeBarras(texto: string | null | undefined): { codigo: string; tipo: "boleto" | "tributo" } | null {
  const d = digitos(texto);
  if (d.length === 44) return { codigo: d, tipo: d[0] === "8" ? "tributo" : "boleto" };
  if (d.length === 47) return { codigo: d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31), tipo: "boleto" };
  if (d.length === 48 && d[0] === "8") return { codigo: [0, 12, 24, 36].map((i) => d.slice(i, i + 11)).join(""), tipo: "tributo" };
  return null;
}

// ------------------------------------------------------------------ Parâmetros e dados
export type ParametrosCnab = {
  banco: string;
  agencia: string | null;
  agencia_dv: string | null;
  conta: string | null;
  conta_dv: string | null;
  convenio: string | null;
  codigo_empresa: string | null;
  razao_social: string | null;
  cnpj: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  cep: string | null;
  uf: string | null;
  versao_arquivo: string;
  versao_lote_credito: string;
  versao_lote_boleto: string;
  versao_lote_tributo: string;
  finalidade_ted: string;
  carteira: string;
  proximo_nosso_numero: number;
  multa_percentual: number;
  juros_dia_percentual: number;
  dias_protesto: number;
};

export type Pessoa = {
  razao_social: string;
  documento: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  chave_pix: string | null;
  tipo_chave_pix: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
};

export type TituloCnab = {
  id: string;
  documento: string | null; // NF
  vencimento: string;
  data: string; // data de pagamento (pagar) ou de emissão (receber)
  valor: number;
  codigo_barras: string | null;
  nosso_numero: string | null;
  pessoa: Pessoa | null;
};

// Forma de pagamento de cada título a pagar, pelo que está cadastrado: código de barras no título (boleto ou
// guia), chave PIX do fornecedor ou conta bancária do fornecedor (Bradesco = crédito em conta; outro banco = TED).
export type FormaPagamento = { forma: "credito" | "ted" | "pix" | "boleto" | "tributo"; rotulo: string } | { erro: string };

const bancoDe = (texto: string | null) => digitos(texto).slice(0, 3);
// Agência ou conta digitada com dígito ("1234-5"): o número sem o dígito, e o dígito.
const semDv = (a: string | null) => digitos(a?.split("-")[0]);
const dvDe = (a: string | null) => (a?.includes("-") ? a.split("-").pop()!.trim().slice(0, 1).toUpperCase() : "");

export function formaDePagamento(t: TituloCnab, bancoDaConta: string): FormaPagamento {
  if (t.codigo_barras) {
    const cb = codigoDeBarras(t.codigo_barras);
    if (!cb) return { erro: "Código de barras inválido (precisa ter 44, 47 ou 48 dígitos)." };
    return cb.tipo === "boleto" ? { forma: "boleto", rotulo: "Boleto" } : { forma: "tributo", rotulo: "Guia / concessionária" };
  }
  const p = t.pessoa;
  if (!p) return { erro: "Título sem fornecedor." };
  if (p.chave_pix) return { forma: "pix", rotulo: "PIX" };
  if (p.banco && p.agencia && p.conta) {
    if (bancoDe(p.banco).length !== 3) return { erro: "Banco do fornecedor sem o código (ex.: 237 Bradesco)." };
    if (!digitos(p.documento)) return { erro: "Fornecedor sem CPF/CNPJ (obrigatório na TED)." };
    return bancoDe(p.banco) === num(bancoDaConta, 3) ? { forma: "credito", rotulo: "Crédito em conta" } : { forma: "ted", rotulo: "TED" };
  }
  return { erro: "Sem forma de pagamento: informe o código de barras no título ou o PIX/conta bancária do fornecedor." };
}

// Faltas nos parâmetros que impedem gerar o arquivo.
export function faltasNosParametros(p: ParametrosCnab, tipo: "pagar" | "receber") {
  const faltas: string[] = [];
  if (!digitos(p.agencia)) faltas.push("agência");
  if (!digitos(p.conta)) faltas.push("conta");
  if (!digitos(p.cnpj)) faltas.push("CNPJ da empresa");
  if (!p.razao_social) faltas.push("razão social");
  if (tipo === "pagar" && !p.convenio) faltas.push("código do convênio");
  if (tipo === "receber" && !digitos(p.codigo_empresa)) faltas.push("código da empresa na cobrança");
  return faltas;
}

// ------------------------------------------------------------------ CNAB 240: pagamentos
const FORMA_LANCAMENTO = { credito: "01", ted: "41", pix: "45", boleto: "", tributo: "11" } as const;

export function remessaPagamentos240(p: ParametrosCnab, nsa: number, agora: Date, titulos: { titulo: TituloCnab; forma: Exclude<FormaPagamento, { erro: string }>["forma"] }[]) {
  const banco = num(p.banco, 3);
  const inscricao = digitos(p.cnpj).length === 11 ? "1" : "2";
  const empresa: Campo[] = [
    [18, 18, inscricao],
    [19, 32, num(p.cnpj, 14)],
    [33, 52, alfa(p.convenio, 20)],
    [53, 57, num(p.agencia, 5)],
    [58, 58, alfa(p.agencia_dv, 1)],
    [59, 70, num(p.conta, 12)],
    [71, 71, alfa(p.conta_dv, 1)],
    [72, 72, " "],
    [73, 102, alfa(p.razao_social, 30)],
  ];
  const hoje = new Date(agora.getTime() - 3 * 3600 * 1000).toISOString();
  const linhas: string[] = [];
  // Header do arquivo.
  linhas.push(
    linha(240, [
      [1, 3, banco], [4, 7, "0000"], [8, 8, "0"], [9, 17, brancos(9)], ...empresa,
      [103, 132, alfa(p.banco === "237" ? "BANCO BRADESCO S.A." : `BANCO ${p.banco}`, 30)], [133, 142, brancos(10)], [143, 143, "1"],
      [144, 151, data8(hoje)], [152, 157, hoje.slice(11, 19).replace(/:/g, "")], [158, 163, num(nsa, 6)], [164, 166, num(p.versao_arquivo, 3)],
      [167, 171, "01600"], [172, 191, brancos(20)], [192, 211, brancos(20)], [212, 240, brancos(29)],
    ])
  );

  // Um lote por forma de lançamento (crédito, TED, PIX, boleto do mesmo banco, boleto de outro banco, guias).
  const grupos = new Map<string, typeof titulos>();
  for (const t of titulos) {
    const chave = t.forma === "boleto" ? (codigoDeBarras(t.titulo.codigo_barras)!.codigo.slice(0, 3) === banco ? "30" : "31") : FORMA_LANCAMENTO[t.forma];
    grupos.set(chave, [...(grupos.get(chave) ?? []), t]);
  }
  let numeroLote = 0;
  let totalRegistros = 1;
  for (const [formaLancamento, itens] of grupos) {
    numeroLote++;
    const lote = num(numeroLote, 4);
    const ehBoleto = formaLancamento === "30" || formaLancamento === "31";
    const ehTributo = formaLancamento === "11";
    const versao = ehBoleto ? p.versao_lote_boleto : ehTributo ? p.versao_lote_tributo : p.versao_lote_credito;
    const registros: string[] = [];
    // Header do lote.
    registros.push(
      linha(240, [
        [1, 3, banco], [4, 7, lote], [8, 8, "1"], [9, 9, "C"], [10, 11, ehTributo ? "22" : "20"], [12, 13, formaLancamento], [14, 16, num(versao, 3)],
        [17, 17, " "], ...empresa, [103, 142, brancos(40)], [143, 172, alfa(p.logradouro, 30)], [173, 177, num(p.numero, 5)],
        [178, 192, alfa(p.complemento, 15)], [193, 212, alfa(p.cidade, 20)], [213, 217, num(digitos(p.cep).slice(0, 5), 5)],
        [218, 220, num(digitos(p.cep).slice(5, 8), 3)], [221, 222, alfa(p.uf, 2)], [223, 224, ehBoleto || ehTributo ? "  " : "01"],
        [225, 230, brancos(6)], [231, 240, brancos(10)],
      ])
    );
    let soma = 0;
    let seq = 0;
    const detalhe = (segmento: string): Campo[] => [[1, 3, banco], [4, 7, lote], [8, 8, "3"], [9, 13, num(++seq, 5)], [14, 14, segmento]];
    for (const { titulo: t, forma } of itens) {
      soma += t.valor;
      const seuNumero = alfa(t.id.replace(/-/g, "").slice(0, 20), 20);
      const f = t.pessoa;
      if (forma === "boleto") {
        const cb = codigoDeBarras(t.codigo_barras)!.codigo;
        registros.push(
          linha(240, [
            ...detalhe("J"), [15, 15, "0"], [16, 17, "00"], [18, 61, cb], [62, 91, alfa(f?.razao_social, 30)], [92, 99, data8(t.vencimento)],
            [100, 114, valor(t.valor, 15)], [115, 129, zeros(15)], [130, 144, zeros(15)], [145, 152, data8(t.data)], [153, 167, valor(t.valor, 15)],
            [168, 182, zeros(15)], [183, 202, seuNumero], [203, 222, brancos(20)], [223, 224, "09"], [225, 230, brancos(6)], [231, 240, brancos(10)],
          ])
        );
        // J-52: pagador (a empresa) e beneficiário (o fornecedor), obrigatório nos boletos registrados.
        const docF = digitos(f?.documento);
        registros.push(
          linha(240, [
            ...detalhe("J"), [15, 15, "0"], [16, 17, "00"], [18, 19, "52"], [20, 20, inscricao], [21, 35, num(p.cnpj, 15)], [36, 75, alfa(p.razao_social, 40)],
            [76, 76, docF.length === 11 ? "1" : "2"], [77, 91, num(docF, 15)], [92, 131, alfa(f?.razao_social, 40)], [132, 132, "0"],
            [133, 147, zeros(15)], [148, 187, brancos(40)], [188, 240, brancos(53)],
          ])
        );
        continue;
      }
      if (forma === "tributo") {
        registros.push(
          linha(240, [
            ...detalhe("O"), [15, 15, "0"], [16, 17, "00"], [18, 61, codigoDeBarras(t.codigo_barras)!.codigo], [62, 91, alfa(f?.razao_social, 30)],
            [92, 99, data8(t.vencimento)], [100, 107, data8(t.data)], [108, 122, valor(t.valor, 15)], [123, 142, seuNumero], [143, 162, brancos(20)],
            [163, 230, brancos(68)], [231, 240, brancos(10)],
          ])
        );
        continue;
      }
      // Crédito em conta, TED e PIX: segmento A (conta ou chave) + segmento B (documento, endereço ou chave PIX).
      const pix = forma === "pix";
      const camara = forma === "credito" ? "000" : forma === "ted" ? "018" : "009";
      registros.push(
        linha(240, [
          ...detalhe("A"), [15, 15, "0"], [16, 17, "00"], [18, 20, camara], [21, 23, pix ? "000" : num(bancoDe(f!.banco), 3)],
          [24, 28, pix ? zeros(5) : num(semDv(f!.agencia), 5)], [29, 29, pix ? " " : alfa(dvDe(f!.agencia), 1)],
          [30, 41, pix ? zeros(12) : num(semDv(f!.conta), 12)], [42, 42, pix ? " " : alfa(dvDe(f!.conta), 1)], [43, 43, " "],
          [44, 73, alfa(f!.razao_social, 30)], [74, 93, seuNumero], [94, 101, data8(t.data)], [102, 104, "BRL"], [105, 119, zeros(15)],
          [120, 134, valor(t.valor, 15)], [135, 154, brancos(20)], [155, 162, zeros(8)], [163, 177, zeros(15)],
          [178, 217, alfa(t.documento ? `NF ${t.documento}` : "", 40)], [218, 219, "  "], [220, 224, forma === "ted" ? num(p.finalidade_ted, 5) : brancos(5)],
          [225, 226, forma === "ted" ? "CC" : "  "], [227, 229, brancos(3)], [230, 230, "0"], [231, 240, brancos(10)],
        ])
      );
      const docF = digitos(f!.documento);
      const tipoInscricao = docF.length === 11 ? "1" : docF.length === 14 ? "2" : "0";
      if (pix) {
        // Tipo da chave: 01 celular, 02 e-mail, 03 CPF/CNPJ, 04 aleatória.
        const tipoChave = { Celular: "01", "E-mail": "02", "CPF/CNPJ": "03", Aleatória: "04" }[f!.tipo_chave_pix ?? ""] ?? "03";
        registros.push(
          linha(240, [
            ...detalhe("B"), [15, 17, alfa(tipoChave, 3)], [18, 18, tipoInscricao], [19, 32, num(docF, 14)], [33, 62, brancos(30)],
            [63, 127, brancos(65)], [128, 226, (f!.chave_pix ?? "").trim().padEnd(99, " ").slice(0, 99)], [227, 232, brancos(6)], [233, 240, zeros(8)],
          ])
        );
      } else {
        registros.push(
          linha(240, [
            ...detalhe("B"), [15, 17, brancos(3)], [18, 18, tipoInscricao], [19, 32, num(docF, 14)], [33, 62, alfa(f!.logradouro, 30)],
            [63, 67, num(f!.numero, 5)], [68, 82, alfa(f!.complemento, 15)], [83, 97, alfa(f!.bairro, 15)], [98, 117, alfa(f!.cidade, 20)],
            [118, 122, num(digitos(f!.cep).slice(0, 5), 5)], [123, 125, num(digitos(f!.cep).slice(5, 8), 3)], [126, 127, alfa(f!.uf, 2)],
            [128, 135, data8(t.vencimento)], [136, 150, valor(t.valor, 15)], [151, 210, zeros(60)], [211, 225, brancos(15)], [226, 226, "0"],
            [227, 232, brancos(6)], [233, 240, zeros(8)],
          ])
        );
      }
    }
    // Trailer do lote.
    registros.push(
      linha(240, [
        [1, 3, banco], [4, 7, lote], [8, 8, "5"], [9, 17, brancos(9)], [18, 23, num(registros.length + 1, 6)], [24, 41, valor(soma, 18)],
        [42, 59, zeros(18)], [60, 65, zeros(6)], [66, 230, brancos(165)], [231, 240, brancos(10)],
      ])
    );
    linhas.push(...registros);
    totalRegistros += registros.length;
  }
  // Trailer do arquivo.
  linhas.push(linha(240, [[1, 3, banco], [4, 7, "9999"], [8, 8, "9"], [9, 17, brancos(9)], [18, 23, num(numeroLote, 6)], [24, 29, num(totalRegistros + 1, 6)], [30, 35, zeros(6)], [36, 240, brancos(205)]]));
  return linhas.join("\r\n") + "\r\n";
}

// ------------------------------------------------------------------ CNAB 400 Bradesco: cobrança
// Dígito do nosso número do Bradesco: módulo 11 (pesos 2 a 7) sobre carteira + nosso número; resto 1 = "P".
export function dvNossoNumero(carteira: string, nossoNumero: string) {
  const base = num(carteira, 2) + num(nossoNumero, 11);
  let soma = 0;
  for (let i = base.length - 1, peso = 2; i >= 0; i--, peso = peso === 7 ? 2 : peso + 1) soma += Number(base[i]) * peso;
  const resto = soma % 11;
  return resto === 0 ? "0" : resto === 1 ? "P" : String(11 - resto);
}

export function faltasCobranca(t: TituloCnab) {
  const f = t.pessoa;
  const faltas: string[] = [];
  if (!f) return ["título sem cliente"];
  if (![11, 14].includes(digitos(f.documento).length)) faltas.push("CPF/CNPJ do cliente");
  if (!f.logradouro) faltas.push("endereço do cliente");
  if (digitos(f.cep).length !== 8) faltas.push("CEP do cliente");
  return faltas;
}

export function remessaCobranca400(p: ParametrosCnab, nsa: number, agora: Date, titulos: (TituloCnab & { nossoNumero: string })[]) {
  const hoje = new Date(agora.getTime() - 3 * 3600 * 1000).toISOString();
  const linhas: string[] = [];
  let seq = 0;
  linhas.push(
    linha(400, [
      [1, 1, "0"], [2, 2, "1"], [3, 9, "REMESSA"], [10, 11, "01"], [12, 26, alfa("COBRANCA", 15)], [27, 46, num(p.codigo_empresa, 20)],
      [47, 76, alfa(p.razao_social, 30)], [77, 79, "237"], [80, 94, alfa("BRADESCO", 15)], [95, 100, data6(hoje)], [101, 108, brancos(8)],
      [109, 110, "MX"], [111, 117, num(nsa, 7)], [118, 394, brancos(277)], [395, 400, num(++seq, 6)],
    ])
  );
  for (const t of titulos) {
    const f = t.pessoa!;
    const doc = digitos(f.documento);
    const multa = Number(p.multa_percentual) > 0;
    const moraDia = (t.valor * Number(p.juros_dia_percentual)) / 100;
    const endereco = [f.logradouro, f.numero, f.complemento, f.bairro, f.cidade && `${f.cidade}/${f.uf ?? ""}`].filter(Boolean).join(" ");
    linhas.push(
      linha(400, [
        [1, 1, "1"], [2, 6, zeros(5)], [7, 7, "0"], [8, 12, zeros(5)], [13, 19, zeros(7)], [20, 20, "0"],
        // Identificação da empresa no banco: zero + carteira + agência + conta + dígito.
        [21, 37, "0" + num(p.carteira, 3) + num(p.agencia, 5) + num(p.conta, 7) + alfa(p.conta_dv, 1)],
        [38, 62, alfa(t.id.replace(/-/g, "").slice(0, 25), 25)], [63, 65, "000"], [66, 66, multa ? "2" : "0"], [67, 70, valor(Number(p.multa_percentual), 4)],
        [71, 81, num(t.nossoNumero, 11)], [82, 82, dvNossoNumero(p.carteira, t.nossoNumero)], [83, 92, zeros(10)],
        [93, 93, "2"], [94, 94, "N"], [95, 104, brancos(10)], [105, 105, " "], [106, 106, "2"], [107, 108, brancos(2)], [109, 110, "01"],
        [111, 120, alfa(t.documento ?? t.nossoNumero, 10)], [121, 126, data6(t.vencimento)], [127, 139, valor(t.valor, 13)], [140, 142, "000"],
        [143, 147, zeros(5)], [148, 149, "01"], [150, 150, "N"], [151, 156, data6(t.data)],
        [157, 158, p.dias_protesto > 0 ? "06" : "00"], [159, 160, p.dias_protesto > 0 ? num(p.dias_protesto, 2) : "00"],
        [161, 173, valor(moraDia, 13)], [174, 179, zeros(6)], [180, 192, zeros(13)], [193, 205, zeros(13)], [206, 218, zeros(13)],
        [219, 220, doc.length === 11 ? "01" : "02"], [221, 234, num(doc, 14)], [235, 274, alfa(f.razao_social, 40)], [275, 314, alfa(endereco, 40)],
        [315, 326, brancos(12)], [327, 331, num(digitos(f.cep).slice(0, 5), 5)], [332, 334, num(digitos(f.cep).slice(5, 8), 3)],
        [335, 394, brancos(60)], [395, 400, num(++seq, 6)],
      ])
    );
  }
  linhas.push(linha(400, [[1, 1, "9"], [2, 394, brancos(393)], [395, 400, num(++seq, 6)]]));
  return linhas.join("\r\n") + "\r\n";
}
