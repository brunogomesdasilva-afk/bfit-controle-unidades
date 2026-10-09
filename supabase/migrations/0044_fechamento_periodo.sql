-- Fechamento de período do financeiro (menu Administrador): lançamentos com data até a data fechada não podem mais
-- ser incluídos, alterados ou excluídos (contas a pagar e a receber pelo vencimento, baixas e extrato pela data).
-- Cadastros (fornecedores, categorias, contas bancárias) continuam livres. Cada mudança da data fica registrada;
-- vale a mais recente (para reabrir, grave uma data anterior).
create table if not exists fin_fechamentos (
  id uuid primary key default gen_random_uuid(),
  data_fechamento date not null,
  observacao text,
  criado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);
alter table fin_fechamentos enable row level security;
drop policy if exists "fin_fechamentos_select" on fin_fechamentos;
create policy "fin_fechamentos_select" on fin_fechamentos for select to authenticated using (true);
drop policy if exists "fin_fechamentos_insert" on fin_fechamentos;
create policy "fin_fechamentos_insert" on fin_fechamentos for insert to authenticated
  with check ((select is_admin()) and (select tem_modulo('adm')));

create or replace function fin_periodo_fechado()
returns date language sql stable security definer set search_path = public as $$
  select data_fechamento from fin_fechamentos order by criado_em desc limit 1;
$$;
grant execute on function fin_periodo_fechado() to authenticated;

create or replace function fin_trava_periodo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  fechado date := fin_periodo_fechado();
  campo text := tg_argv[0];
  data_nova date;
  data_antiga date;
begin
  if fechado is null then
    return coalesce(new, old);
  end if;
  if tg_op <> 'DELETE' then
    data_nova := (to_jsonb(new) ->> campo)::date;
  end if;
  if tg_op <> 'INSERT' then
    data_antiga := (to_jsonb(old) ->> campo)::date;
  end if;
  if (data_nova is not null and data_nova <= fechado) or (data_antiga is not null and data_antiga <= fechado) then
    raise exception 'Período fechado até %: lançamentos com data até esse dia não podem ser incluídos, alterados ou excluídos.',
      to_char(fechado, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists fin_trava_titulos on fin_titulos;
create trigger fin_trava_titulos before insert or update or delete on fin_titulos
  for each row execute function fin_trava_periodo('vencimento');
drop trigger if exists fin_trava_baixas on fin_baixas;
create trigger fin_trava_baixas before insert or update or delete on fin_baixas
  for each row execute function fin_trava_periodo('data');
drop trigger if exists fin_trava_movimentos on fin_movimentos;
create trigger fin_trava_movimentos before insert or update or delete on fin_movimentos
  for each row execute function fin_trava_periodo('data');
