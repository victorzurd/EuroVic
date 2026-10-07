export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  const url = process.env.POSTGRES_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.POSTGRES_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return res.status(500).json({ error: 'Falta configurar la URL o la clave pública de Supabase.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ url, anonKey });
}
