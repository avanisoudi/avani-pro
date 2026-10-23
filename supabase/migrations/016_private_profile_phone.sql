-- Keep the existing phone values, but do not expose them through the public
-- PostgREST roles. Public profile fields remain queryable by the client.
-- The server-only service_role retains full access for trusted server tasks.
revoke select (phone) on table public.profiles from anon, authenticated, public;
revoke select on table public.profiles from anon, authenticated, public;

grant select (
  id,
  username,
  full_name,
  avatar_url,
  cover_url,
  bio,
  verified_type,
  followers_count,
  following_count,
  created_at,
  updated_at
) on table public.profiles to anon, authenticated;

grant select on table public.profiles to service_role;
