-- AVANI PRO: autoriser les quatre thèmes de l’interface.
-- Les préférences restent privées par compte grâce aux politiques RLS de user_settings.
do $$
begin
  alter table public.user_settings drop constraint if exists user_settings_appearance_check;
  alter table public.user_settings add constraint user_settings_appearance_check
    check (appearance is null or appearance in ('light', 'dark', 'neon', 'blue'));
end $$;
