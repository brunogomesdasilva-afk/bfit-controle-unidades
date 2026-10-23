-- Aprovação das compras (tela Controle de compras): Pendente, Em andamento ou Aprovado. Só quem tem
-- "aprova_compras" no cadastro (hoje, o Bruno) pode mudar; a trava é do banco, vale para qualquer tela.
alter table compras add column if not exists aprovacao text not null default 'pendente'
  check (aprovacao in ('pendente', 'em_andamento', 'aprovado'));
alter table compras add column if not exists aprovacao_por uuid references profiles(id) on delete set null;
alter table compras add column if not exists aprovacao_em timestamptz;

alter table profiles add column if not exists aprova_compras boolean not null default false;
update profiles set aprova_compras = true where lower(email) = 'brunogomesdasilva@gmail.com';

create or replace function pode_aprovar_compras()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and ativo and aprova_compras);
$$;
revoke execute on function pode_aprovar_compras() from public;
grant execute on function pode_aprovar_compras() to authenticated;

-- Compra nova entra sempre "pendente" (para quem não aprova); mudar a aprovação exige a permissão e registra
-- quem e quando. Sem usuário logado (chave de serviço, importações) passa.
create or replace function compras_trava_aprovacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.aprovacao <> 'pendente' and not pode_aprovar_compras() then
      new.aprovacao := 'pendente';
    end if;
  elsif new.aprovacao is distinct from old.aprovacao then
    if not pode_aprovar_compras() then
      raise exception 'Só quem aprova compras pode alterar a aprovação.' using errcode = '42501';
    end if;
  else
    return new;
  end if;
  if new.aprovacao <> 'pendente' or tg_op = 'UPDATE' then
    new.aprovacao_por := auth.uid();
    new.aprovacao_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_compras_aprovacao on compras;
create trigger trg_compras_aprovacao
  before insert or update on compras
  for each row execute function compras_trava_aprovacao();
