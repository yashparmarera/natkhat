-- Update the café's official phone and WhatsApp number.
ALTER TABLE public.store_settings
  ALTER COLUMN contact_phone SET DEFAULT '+91 70426 53174',
  ALTER COLUMN whatsapp_number SET DEFAULT '917042653174';

UPDATE public.store_settings
SET
  contact_phone = '+91 70426 53174',
  whatsapp_number = '917042653174',
  updated_at = now()
WHERE id = 1;
