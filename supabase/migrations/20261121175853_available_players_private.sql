-- available_players() is only used inside the database (request guard); don't let users read
-- another team's availability through the API.
revoke execute on function public.available_players(uuid, uuid) from authenticated;
