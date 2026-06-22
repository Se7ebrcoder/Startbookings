-- Rodar no Supabase SQL Editor para adicionar a coluna de controle de sessão
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_token text;
