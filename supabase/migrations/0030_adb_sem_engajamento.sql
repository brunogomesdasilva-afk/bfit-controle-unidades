-- A.D.B sem o item 1 (Engajamento institucional): as avaliações passam a ter 7 itens (colunas nota_2 a nota_8,
-- mostrados como 1 a 7). nota_1 deixa de ser obrigatória (fica só o valor das avaliações antigas) e a média
-- passa a ser dos 7 itens, inclusive nas avaliações já lançadas.
alter table avaliacoes_adb alter column nota_1 drop not null;
alter table avaliacoes_adb drop column if exists media;
alter table avaliacoes_adb add column media numeric generated always as (
  (nota_2 + nota_3 + nota_4 + nota_5 + nota_6 + nota_7 + nota_8)::numeric / 7
) stored;
