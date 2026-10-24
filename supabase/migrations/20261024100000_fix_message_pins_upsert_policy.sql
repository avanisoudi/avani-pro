-- Keep message pin upserts compatible with RLS: PostgREST may take the
-- UPDATE path when a duplicate pin is submitted. Restrict it to the pinner
-- and members of the same conversation, and validate the message/conversation pair.
drop policy if exists "members update pinned messages in their conversations" on public.message_pins;
create policy "members update pinned messages in their conversations"
  on public.message_pins for update
  using (
    pinned_by = auth.uid()
    and public.is_conversation_member(conversation_id, auth.uid())
  )
  with check (
    pinned_by = auth.uid()
    and public.is_conversation_member(conversation_id, auth.uid())
    and exists (
      select 1
      from public.messages m
      where m.id = message_pins.message_id
        and m.conversation_id = message_pins.conversation_id
    )
  );
