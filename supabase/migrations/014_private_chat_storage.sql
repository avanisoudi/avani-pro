-- Repair missing production storage for private attachments; maximum 25 MiB.
insert into storage.buckets(id,name,public,file_size_limit)
values('message-attachments','message-attachments',false,26214400)
on conflict(id) do update set public=false,file_size_limit=26214400;
drop policy if exists "message attachments members can read" on storage.objects;
create policy "message attachments members can read" on storage.objects for select to authenticated
using(bucket_id='message-attachments' and exists(select 1 from public.conversation_members cm where cm.conversation_id::text=(storage.foldername(name))[1] and cm.user_id=auth.uid()));
drop policy if exists "message attachments members can upload" on storage.objects;
create policy "message attachments members can upload" on storage.objects for insert to authenticated
with check(bucket_id='message-attachments' and (storage.foldername(name))[2]=auth.uid()::text and exists(select 1 from public.conversation_members cm where cm.conversation_id::text=(storage.foldername(name))[1] and cm.user_id=auth.uid()));
drop policy if exists "message attachments owners can delete" on storage.objects;
create policy "message attachments owners can delete" on storage.objects for delete to authenticated
using(bucket_id='message-attachments' and (storage.foldername(name))[2]=auth.uid()::text);
