-- Datas importantes de cada academia (PMOC, dedetização, AVCB, CREF...): item e data limite de renovação.
-- Mesma regra dos outros cadastros da academia: o administrador cuida de todas, o usuário só da dele.

create table if not exists datas_importantes (
  id uuid primary key default gen_random_uuid(),
  academia_id uuid not null references academias(id) on delete cascade,
  item text not null,
  vencimento date,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists datas_importantes_item_unico on datas_importantes (academia_id, lower(item));
create index if not exists idx_datas_importantes_vencimento on datas_importantes (academia_id, vencimento);

drop trigger if exists trg_datas_importantes_updated_at on datas_importantes;
create trigger trg_datas_importantes_updated_at before update on datas_importantes
  for each row execute function set_updated_at();

alter table datas_importantes enable row level security;
drop policy if exists "datas_importantes_select" on datas_importantes;
create policy "datas_importantes_select" on datas_importantes for select to authenticated
  using ((select is_admin()) or academia_id = (select minha_academia()));
drop policy if exists "datas_importantes_write" on datas_importantes;
create policy "datas_importantes_write" on datas_importantes for all to authenticated
  using ((select is_admin()) or academia_id = (select minha_academia()))
  with check ((select is_admin()) or academia_id = (select minha_academia()));
-- Backup em andamento: só o administrador lê e grava (mesma regra das demais tabelas).
drop policy if exists "manutencao_bloqueia" on datas_importantes;
create policy "manutencao_bloqueia" on datas_importantes as restrictive for all to authenticated
  using (not (select em_manutencao()) or (select is_admin()))
  with check (not (select em_manutencao()) or (select is_admin()));

-- Itens de sempre já cadastrados em todas as academias, sem data (é só preencher o vencimento).
insert into datas_importantes (academia_id, item)
select a.id, i.item
from academias a
cross join (values
  ('PMOC'), ('Dedetização'), ('Limpeza caixa d''água'), ('Extintores'), ('Mangueiras de incêndio'),
  ('Filtro de bebedouro'), ('AVCB'), ('CREF'), ('EPIs limpeza')
) as i(item)
on conflict do nothing;
