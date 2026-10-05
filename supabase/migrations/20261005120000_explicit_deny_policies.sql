-- Say out loud what these tables already are: closed to the API.
--
-- private.admins, public.feedback and public.feedback_messages have row-level
-- security on, every grant revoked, and no policies, because nobody reads or
-- writes them directly: the definer functions in the admin and feedback
-- migrations are the only way in. That is already a full lock (no policy means
-- no rows, and no grant means no access at all), but the database linter reads
-- "RLS enabled, no policy" as a table someone forgot to finish.
--
-- A policy that matches nothing says it was on purpose. It changes no behaviour:
-- the functions run as the table owner, which row-level security doesn't apply
-- to, and the grants are still the first thing a direct request hits.
--
-- It is deliberately permissive, not restrictive: a future policy that really
-- does open one of these tables to someone should work, not be silently vetoed.

create policy "Closed to the API; reached through functions only" on private.admins
  for all to anon, authenticated using (false) with check (false);

create policy "Closed to the API; reached through functions only" on public.feedback
  for all to anon, authenticated using (false) with check (false);

create policy "Closed to the API; reached through functions only" on public.feedback_messages
  for all to anon, authenticated using (false) with check (false);
