import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.POSTGRES_SUPABASE_URL;
  const serviceKey = process.env.POSTGRES_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Falta configurar Supabase en el servidor.');
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function requireUser(req, res) {
  const authorization = req.headers.authorization || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: 'Debes iniciar sesión para continuar.' });
    return null;
  }

  try {
    const { data, error } = await createAdminClient().auth.getUser(token);
    if (error || !data.user) throw new Error('Sesión no válida.');
    return data.user;
  } catch {
    res.status(401).json({ error: 'Sesión no válida o caducada. Inicia sesión de nuevo.' });
    return null;
  }
}
