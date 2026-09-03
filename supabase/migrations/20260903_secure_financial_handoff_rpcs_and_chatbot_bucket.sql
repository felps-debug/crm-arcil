-- Financial handoff RPCs were security definer functions reachable with just
-- the public anon key (no login required). finalize_financial_handoff let
-- anyone mark boletos as paid/renegotiated and forge the acting user;
-- claim_due_financial_handoff_followups leaked customer phone numbers and
-- could stall the real follow-up queue by marking rows "processing".
-- Lock both down to service_role only (called exclusively from internal API
-- routes via the admin client).
revoke execute on function public.finalize_financial_handoff(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.claim_due_financial_handoff_followups(integer) from public, anon, authenticated;

grant execute on function public.finalize_financial_handoff(uuid, uuid, text, uuid, jsonb) to service_role;
grant execute on function public.claim_due_financial_handoff_followups(integer) to service_role;

-- chatbot-images bucket accepted INSERT from roles:{public} (anon + authenticated),
-- i.e. anyone with the public anon key could upload arbitrary files there without
-- being logged into the CRM. /chatbot is behind the auth proxy (src/proxy.ts
-- requires a session for every route except /login), so restricting to
-- `authenticated` matches actual usage. Also cap uploads to image mime types,
-- matching the client's accept="image/*".
drop policy if exists chatbot_insert on storage.objects;
create policy chatbot_insert on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'chatbot-images');

update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
where id = 'chatbot-images';
