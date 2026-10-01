-- NORTH & FORM — Phase 2: fictional demo catalogue — 12 products.
--
-- All names, prices and copy are fictional demo content for a
-- fictional brand. No third-party brand names are used anywhere.
--
-- Images are placeholders on placehold.co rendered in the NORTH & FORM
-- palette (#111111 near-black, #F7F5F0 warm off-white, #4A5140 olive).
-- Phase 3 must allow that host in next.config.ts `images.remotePatterns`
-- before rendering them with next/image.
--
-- Idempotent: re-running inserts nothing new.

insert into public.products (
  category_id, name, slug, description,
  price, stock_quantity, sizes, images, featured
)
select
  c.id,
  v.name,
  v.slug,
  v.description,
  v.price,
  v.stock_quantity,
  v.sizes,
  v.images,
  v.featured
from (
  values
    -- Shirts ------------------------------------------------------------
    ('shirts', 'Essential Oxford', 'essential-oxford',
     'Crisp cotton oxford with a structured collar and a single chest pocket. Cut relaxed through the body so it works over a tee or on its own.',
     28000.00, 24, array['S','M','L','XL','XXL'],
     array['https://placehold.co/1000x1250/111111/F7F5F0?text=Essential+Oxford+Front',
            'https://placehold.co/1000x1250/4A5140/F7F5F0?text=Essential+Oxford+Detail'],
     true),
    ('shirts', 'Graphic T-Shirt', 'graphic-t-shirt',
     'Dense cotton jersey with one chest graphic. Pre-washed so it keeps its shape.',
     25000.00, 30, array['S','M','L','XL','XXL'],
     array['https://placehold.co/1000x1250/111111/F7F5F0?text=Graphic+T-Shirt+Front',
            'https://placehold.co/1000x1250/4A5140/F7F5F0?text=Graphic+T-Shirt+Detail'],
     false),
    ('shirts', 'Plain T-Shirt', 'plain-t-shirt',
     'The everyday crew neck in dense, smooth cotton. No logo, no noise.',
     22000.00, 40, array['S','M','L','XL','XXL'],
     array['https://placehold.co/1000x1250/111111/F7F5F0?text=Plain+T-Shirt+Front',
            'https://placehold.co/1000x1250/4A5140/F7F5F0?text=Plain+T-Shirt+Detail'],
     false),

    -- Jeans -------------------------------------------------------------
    ('jeans', 'Baggy Jeans', 'baggy-jeans',
     'Wide through the leg with a low rise. Rigid denim that breaks in with wear.',
     35000.00, 18, array['30','32','34','36','38'],
     array['https://placehold.co/1000x1250/111111/F7F5F0?text=Baggy+Jeans+Front',
            'https://placehold.co/1000x1250/4A5140/F7F5F0?text=Baggy+Jeans+Detail'],
     true),
    ('jeans', 'Washed Black Denim', 'washed-black-denim',
     'Deep black, stone-washed for softness. Straight leg, minimal hardware.',
     38000.00, 22, array['30','32','34','36','38'],
     array['https://placehold.co/1000x1250/111111/F7F5F0?text=Washed+Black+Denim+Front',
            'https://placehold.co/1000x1250/4A5140/F7F5F0?text=Washed+Black+Denim+Detail'],
     false),
    ('jeans', 'Straight Stone Denim', 'straight-stone-denim',
     'A light stone wash on a straight cut. Fades the way you wear it.',
     36000.00, 20, array['30','32','34','36','38'],
     array['https://placehold.co/1000x1250/111111/F7F5F0?text=Straight+Stone+Denim+Front',
            'https://placehold.co/1000x1250/4A5140/F7F5F0?text=Straight+Stone+Denim+Detail'],
     false),

    -- Shoes -------------------------------------------------------------
    ('shoes', 'Classic Court Sneaker', 'classic-court-sneaker',
     'A low court profile on a clean rubber sole. Plain toe, quiet branding, built to walk the city.',
     55000.00, 15, array['40','41','42','43','44','45'],
     array['https://placehold.co/1000x1250/111111/F7F5F0?text=Classic+Court+Sneaker+Front',
            'https://placehold.co/1000x1250/4A5140/F7F5F0?text=Classic+Court+Sneaker+Detail'],
     true),
    ('shoes', 'Everyday Loafer', 'everyday-loafer',
     'Unlined leather penny loafer. Equally at home with denim or tailoring.',
     62000.00, 10, array['40','41','42','43','44','45'],
     array['https://placehold.co/1000x1250/111111/F7F5F0?text=Everyday+Loafer+Front',
            'https://placehold.co/1000x1250/4A5140/F7F5F0?text=Everyday+Loafer+Detail'],
     false),
    ('shoes', 'Everyday Slide', 'everyday-slide',
     'Moulded foam slide with a soft footbed, cut for the walk home.',
     25000.00, 35, array['39','40','41','42','43','44','45'],
     array['https://placehold.co/1000x1250/111111/F7F5F0?text=Everyday+Slide+Front',
            'https://placehold.co/1000x1250/4A5140/F7F5F0?text=Everyday+Slide+Detail'],
     false),

    -- Hoodies -----------------------------------------------------------
    ('hoodies', 'Studio Heavyweight Hoodie', 'studio-heavyweight-hoodie',
     'Boxy heavyweight cotton with a double-layer hood and ribbed cuffs. It sits heavy on the shoulders, in a good way.',
     45000.00, 16, array['S','M','L','XL','XXL'],
     array['https://placehold.co/1000x1250/111111/F7F5F0?text=Studio+Heavyweight+Hoodie+Front',
            'https://placehold.co/1000x1250/4A5140/F7F5F0?text=Studio+Heavyweight+Hoodie+Detail'],
     true),
    ('hoodies', 'Olive Essential Hoodie', 'olive-essential-hoodie',
     'Deep olive brushed-back fleece, drawcord hood, no branding anywhere on it.',
     40000.00, 26, array['S','M','L','XL','XXL'],
     array['https://placehold.co/1000x1250/4A5140/F7F5F0?text=Olive+Essential+Hoodie+Front',
            'https://placehold.co/1000x1250/111111/F7F5F0?text=Olive+Essential+Hoodie+Detail'],
     false),
    ('hoodies', 'Studio Hoodie', 'studio-hoodie',
     'A lighter loopback hoodie for the hours between afternoon heat and evening cold.',
     35000.00, 28, array['S','M','L','XL','XXL'],
     array['https://placehold.co/1000x1250/111111/F7F5F0?text=Studio+Hoodie+Front',
            'https://placehold.co/1000x1250/4A5140/F7F5F0?text=Studio+Hoodie+Detail'],
     false)
) as v(category_slug, name, slug, description, price, stock_quantity, sizes, images, featured)
join public.categories c on c.slug = v.category_slug
on conflict (slug) do nothing;