// Tabelas oficiais usadas nas conferências (folha e pagamentos) e no robô validar-pagamentos do Claude Code.
// Antes o Claude pesquisava essas tabelas na internet a cada conferência (cerca de 2 a 3 minutos de pesquisa e
// raciocínio em volta dela). Elas mudam uma vez por ano: em janeiro, quando sair a portaria do INSS e o salário
// mínimo novo, acrescente o ano aqui e publique o sistema.

export const TABELAS_OFICIAIS = `TABELAS OFICIAIS (internalizadas no sistema BFIT; use-as como fonte e cite "tabelas oficiais do sistema")

Use estes valores diretamente: NÃO pesquise na internet o que está aqui. Pesquise só o que não estiver aqui (ex.: convenção coletiva, ISS municipal, norma específica) ou competência de um ano que não conste abaixo.

SALÁRIO MÍNIMO NACIONAL
- 2025: R$ 1.518,00.
- 2026: R$ 1.621,00.

INSS — EMPREGADO, DOMÉSTICO E AVULSO (progressivo por faixa: cada alíquota só sobre a parte do salário dentro da faixa; EC 103/2019)
- 2026 (Portaria Interministerial MPS/MF nº 13/2026): até R$ 1.621,00 = 7,5%; de R$ 1.621,01 a R$ 2.902,84 = 9%; de R$ 2.902,85 a R$ 4.354,27 = 12%; de R$ 4.354,28 a R$ 8.475,55 = 14%. Teto R$ 8.475,55; desconto máximo R$ 988,09.
- 2025 (Portaria Interministerial MPS/MF nº 6/2025): até R$ 1.518,00 = 7,5%; de R$ 1.518,01 a R$ 2.793,88 = 9%; de R$ 2.793,89 a R$ 4.190,83 = 12%; de R$ 4.190,84 a R$ 8.157,41 = 14%. Teto R$ 8.157,41.
- O 13º salário tem desconto calculado em separado, com a mesma tabela.

IRRF — TABELA PROGRESSIVA MENSAL (vigente desde maio/2025 e em 2026)
- Base de cálculo = rendimentos tributáveis − INSS − dependentes (R$ 189,59 cada) − pensão alimentícia judicial; OU rendimentos tributáveis − desconto simplificado de R$ 607,20 (no lugar das deduções, quando for mais vantajoso). A folha deve usar a opção que der o menor imposto.
- Até R$ 2.428,80 = isento; de R$ 2.428,81 a R$ 2.826,65 = 7,5% (deduzir R$ 182,16); de R$ 2.826,66 a R$ 3.751,05 = 15% (deduzir R$ 394,16); de R$ 3.751,06 a R$ 4.664,68 = 22,5% (deduzir R$ 675,49); acima de R$ 4.664,68 = 27,5% (deduzir R$ 908,73).
- Redução da Lei 15.270/2025 (a partir de jan/2026), aplicada DEPOIS do imposto da tabela: rendimentos tributáveis do mês até R$ 5.000,00 = redução de até R$ 312,89 (o imposto fica zero); de R$ 5.000,01 a R$ 7.350,00 = redução de R$ 978,62 − (0,133145 × rendimentos tributáveis), limitada ao imposto calculado; acima de R$ 7.350,00 = sem redução. A redução é calculada sobre os rendimentos tributáveis brutos do mês (sem descontar o INSS). Se a folha usar outra base para a redução, aponte como ponto a confirmar com a contabilidade, não como erro definitivo.
- Pagamentos feitos até dezembro/2025 não têm a redução.

SALÁRIO-FAMÍLIA (por filho ou equiparado de até 14 anos, ou inválido de qualquer idade; não é proporcional: acima do limite no mês, não há cota)
- 2026: R$ 67,54 por filho, para remuneração mensal até R$ 1.980,38.
- 2025: R$ 65,00 por filho, para remuneração mensal até R$ 1.906,04.

PARÂMETROS TRABALHISTAS FIXOS
- FGTS: 8% da remuneração (aprendiz: 2%). Estagiário não tem FGTS.
- Vale-transporte (Lei 7.418/1985): desconto de até 6% do salário-base, limitado ao valor do VT concedido. Estagiário: auxílio-transporte sem desconto (Lei 11.788/2008).
- Hora extra: adicional mínimo de 50% (CF, art. 7º, XVI); domingo ou feriado trabalhado sem folga compensatória: 100% (Lei 605/1949, art. 9º), salvo percentual maior da convenção coletiva.
- Adicional noturno urbano: 20%, das 22h às 5h, com hora noturna de 52min30s (CLT, art. 73).
- Estágio (Lei 11.788/2008): jornada de até 6 horas por dia e 30 por semana (ensino superior e médio regular); recesso de 30 dias por ano (proporcional se menor que 1 ano), remunerado quando há bolsa; bolsa e auxílio-transporte obrigatórios no estágio não obrigatório; sem 13º, sem férias com 1/3, sem FGTS.

RETENÇÕES NAS NOTAS DE SERVIÇO (detalhes e exceções em REGRAS_PAGAMENTOS)
- IRRF 1,5% (serviços profissionais, RIR/2018 art. 714) ou 1% (limpeza, conservação, segurança, vigilância e locação de mão de obra, art. 716), dispensado até R$ 10,00 de imposto.
- PIS/COFINS/CSLL 4,65% (Lei 10.833/2003, art. 30), dispensados quando a soma não passa de R$ 10,00.
- INSS 11% na cessão de mão de obra e empreitada (Lei 8.212/1991, art. 31).
- ISS: alíquota de 2% a 5% conforme a lei do município (LC 116/2003); a alíquota e a obrigação de retenção de Osasco NÃO estão nesta tabela: confira na nota e, se houver dúvida, pesquise a lei municipal.
- MEI e optantes do Simples não sofrem retenção de IRRF nem de PIS/COFINS/CSLL.`;
