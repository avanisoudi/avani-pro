-- Avani Pro: pièces jointes privées des messages
-- Les objets sont lisibles uniquement par les membres de la conversation concernée.

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do update set public = false;

drop policy if exists "message attachments members can read" on storage.objects;
create policy "message attachments members can read"
on storage.objects for select
using (
  bucket_id = 'message-attachments'
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id::text = (storage.foldername(name))[1]
      and cm.user_id = auth.uid()
  )
);

drop policy if exists "message attachments members can upload" on storage.objects;
create policy "message attachments members can upload"
on storage.objects for insert
with check (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id::text = (storage.foldername(name))[1]
      and cm.user_id = auth.uid()
  )
);

drop policy if exists "message attachments owners can update" on storage.objects;
create policy "message attachments owners can update"
on storage.objects for update
using (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "message attachments owners can delete" on storage.objects;
create policy "message attachments owners can delete"
on storage.objects for delete
using (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
);
