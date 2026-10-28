-- Financeiro rápido com muitos lançamentos (histórico do Omie: 27 mil títulos e baixas). As regras de acesso
-- chamavam pode_financeiro_titulo()/pode_financeiro_conta() linha por linha, e a view fin_titulos_situacao soma
-- todas as baixas: com o histórico, a consulta passava do tempo limite e Contas a pagar aparecia vazia.
-- Mesma regra de antes (módulo financeiro e, fora o administrador, só a própria academia), mas com as funções
-- calculadas uma vez por consulta.

drop policy if exists "fin_contas_acesso" on fin_contas;
create policy "fin_contas_acesso" on fin_contas for all to authenticated
  using ((select tem_modulo('financeiro')) and ((select is_admin()) or academia_id = (select minha_academia())))
  with check ((select tem_modulo('financeiro')) and ((select is_admin()) or academia_id = (select minha_academia())));

drop policy if exists "fin_titulos_acesso" on fin_titulos;
create policy "fin_titulos_acesso" on fin_titulos for all to authenticated
  using ((select tem_modulo('financeiro')) and ((select is_admin()) or academia_id = (select minha_academia())))
  with check ((select tem_modulo('financeiro')) and ((select is_admin()) or academia_id = (select minha_academia())));

drop policy if exists "fin_movimentos_acesso" on fin_movimentos;
create policy "fin_movimentos_acesso" on fin_movimentos for all to authenticated
  using ((select tem_modulo('financeiro')) and ((select is_admin())
    or exists (select 1 from fin_contas c where c.id = conta_id and c.academia_id = (select minha_academia()))))
  with check ((select tem_modulo('financeiro')) and ((select is_admin())
    or exists (select 1 from fin_contas c where c.id = conta_id and c.academia_id = (select minha_academia()))));

drop policy if exists "fin_baixas_acesso" on fin_baixas;
create policy "fin_baixas_acesso" on fin_baixas for all to authenticated
  using ((select tem_modulo('financeiro')) and ((select is_admin())
    or exists (select 1 from fin_titulos t where t.id = titulo_id and t.academia_id = (select minha_academia()))))
  with check ((select tem_modulo('financeiro')) and ((select is_admin())
    or exists (select 1 from fin_titulos t where t.id = titulo_id and t.academia_id = (select minha_academia()))));

create index if not exists fin_baixas_movimento on fin_baixas (movimento_id);
create index if not exists fin_titulos_situacao_busca on fin_titulos (tipo, vencimento);
analyze fin_titulos;
analyze fin_baixas;
analyze fin_movimentos;
