-- Pasta privada no armazenamento do Supabase para os Excel de importação (passagens e Gympass).
-- O arquivo vai direto do computador do usuário para cá (sem o limite de tamanho do servidor do site);
-- o sistema lê de lá, importa e apaga. Cada usuário só mexe na própria pasta (<id do usuário>/arquivo).

insert into storage.buckets (id, name, public, file_size_limit)
values ('importacoes', 'importacoes', false, 52428800) -- até 50 MB por arquivo
on conflict (id) do nothing;

drop policy if exists "importacoes_enviar_propria_pasta" on storage.objects;
create policy "importacoes_enviar_propria_pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'importacoes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "importacoes_ler_propria_pasta" on storage.objects;
create policy "importacoes_ler_propria_pasta" on storage.objects for select to authenticated
  using (bucket_id = 'importacoes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "importacoes_apagar_propria_pasta" on storage.objects;
create policy "importacoes_apagar_propria_pasta" on storage.objects for delete to authenticated
  using (bucket_id = 'importacoes' and (storage.foldername(name))[1] = auth.uid()::text);
