-- NORTH & FORM — Phase 2: fictional demo catalogue — categories.
--
-- Idempotent: re-running inserts nothing new.

insert into public.categories (name, slug, description)
values
  ('Shirts',  'shirts',  'Cotton shirts and tees cut for everyday rotation.'),
  ('Jeans',   'jeans',   'Rigid and washed denim, cut to move.'),
  ('Shoes',   'shoes',   'Quiet, sturdy footwear that finishes the fit.'),
  ('Hoodies', 'hoodies', 'Heavyweight cotton for cooler evenings.')
on conflict (slug) do nothing;