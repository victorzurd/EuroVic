import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.POSTGRES_SUPABASE_URL;
const supabaseServiceKey = process.env.POSTGRES_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Faltan las variables POSTGRES_SUPABASE_URL o POSTGRES_SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. OBTENER LISTA DE GASTOS
    if (req.method === 'GET') {
      const { month, limit } = req.query;
      let query = supabase.from('gastos').select('*').order('fecha', { ascending: false });

      if (month) {
        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr, 10);
        const mon = parseInt(monthStr, 10);
        if (!isNaN(year) && !isNaN(mon)) {
          const startDate = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0, 0)).toISOString();
          const endDate = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999)).toISOString();
          query = query.gte('fecha', startDate).lte('fecha', endDate);
        }
      } else if (limit) {
        query = query.limit(parseInt(limit, 10));
      } else {
        query = query.limit(200); // Límite por defecto para optimizar transferencia
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    // 2. CREAR GASTO MANUAL
    if (req.method === 'POST') {
      const { comercio, monto, categoria, emoji, fecha } = req.body || {};

      if (!comercio || monto === undefined || monto === null || isNaN(parseFloat(monto))) {
        return res.status(400).json({ error: 'Faltan datos requeridos (comercio o monto válido)' });
      }

      const fechaFinal = fecha || new Date().toISOString();

      const { data, error } = await supabase
        .from('gastos')
        .insert([
          {
            comercio,
            monto: parseFloat(monto),
            categoria: categoria || 'Varios',
            emoji: emoji || '✨',
            fecha: fechaFinal
          }
        ])
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    // 3. BORRAR UN GASTO O UN MES COMPLETO
    if (req.method === 'DELETE') {
      const { id, month } = req.query;

      if (id) {
        const { error } = await supabase
          .from('gastos')
          .delete()
          .eq('id', id);

        if (error) throw error;
      } else if (month) {
        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr, 10);
        const mon = parseInt(monthStr, 10);

        if (isNaN(year) || isNaN(mon)) {
          return res.status(400).json({ error: 'Formato de mes inválido (debe ser YYYY-MM)' });
        }

        const startDate = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0, 0)).toISOString();
        const endDate = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999)).toISOString();

        const { error } = await supabase
          .from('gastos')
          .delete()
          .gte('fecha', startDate)
          .lte('fecha', endDate);

        if (error) throw error;
      } else {
        return res.status(400).json({ error: 'Falta parámetro id o month' });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (error) {
    console.error('Error en gastos.js:', error);
    return res.status(500).json({ error: error.message });
  }
}