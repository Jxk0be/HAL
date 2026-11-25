-- Trigger function only: not callable through the API.
revoke execute on function public.staff_only_guard() from public, anon, authenticated;
