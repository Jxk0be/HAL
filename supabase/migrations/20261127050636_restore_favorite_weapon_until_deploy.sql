-- The deployed site still selects favorite_weapon; keep an unused column until the new build is live,
-- then drop it in a later migration. Nothing reads or shows it any more.
alter table public.profiles add column if not exists favorite_weapon text check (favorite_weapon is null or char_length(favorite_weapon) <= 40);
grant select (favorite_weapon) on public.profiles to anon, authenticated;
grant update (favorite_weapon) on public.profiles to authenticated;
