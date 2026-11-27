-- Favorite weapon is removed from profiles (not wanted on player pages).
alter table public.profiles drop column if exists favorite_weapon;
