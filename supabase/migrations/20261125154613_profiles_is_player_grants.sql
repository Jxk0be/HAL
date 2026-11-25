-- profiles uses column privileges, so the new column needs its own grants.
-- Anyone may read it; only the owner can change it (enforced by profiles_guard).
grant select (is_player) on public.profiles to anon, authenticated;
grant update (is_player) on public.profiles to authenticated;
