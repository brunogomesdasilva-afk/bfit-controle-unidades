-- Data da solicitação (compras) e data de inclusão (manutenção): sempre o dia em que a linha foi
-- incluída, no horário de Brasília, e nunca alteradas depois.

create or replace function fixar_data_de_inclusao()
returns trigger as $$
declare
  campo text := tg_argv[0];
begin
  if tg_op = 'INSERT' then
    new := jsonb_populate_record(new, jsonb_build_object(campo, (now() at time zone 'America/Sao_Paulo')::date));
  else
    new := jsonb_populate_record(new, jsonb_build_object(campo, to_jsonb(old) -> campo));
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_compras_data_solicitacao on compras;
create trigger trg_compras_data_solicitacao
  before insert or update on compras
  for each row execute function fixar_data_de_inclusao('data_solicitacao');

drop trigger if exists trg_manutencoes_data_inclusao on manutencoes;
create trigger trg_manutencoes_data_inclusao
  before insert or update on manutencoes
  for each row execute function fixar_data_de_inclusao('data_inclusao');
