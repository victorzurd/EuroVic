import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. OBTENER LISTA DE GASTOS
    if (req.method === 'GET') {
      const { rows } = await pool.query('SELECT * FROM gastos ORDER BY fecha DESC');
      return res.status(200).json(rows);
    }

    // 2. CREAR GASTO MANUAL
    if (req.method === 'POST') {
      const { comercio, monto, categoria, emoji, fecha } = req.body || {};
      
      if (!comercio || monto === undefined || monto === null) {
        return res.status(400).json({ error: 'Faltan datos requeridos (comercio o monto)' });
      }

      const fechaFinal = fecha || new Date().toISOString();
      const query = `
        INSERT INTO gastos (comercio, monto, categoria, emoji, fecha)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;
      const values = [comercio, parseFloat(monto), categoria || 'Varios', emoji || '✨', fechaFinal];

      const { rows } = await pool.query(query, values);
      return res.status(200).json(rows[0]);
    }

    // 3. BORRAR UN GASTO O UN MES COMPLETO
    if (req.method === 'DELETE') {
      const { id, month } = req.query;

      if (id) {
        await pool.query('DELETE FROM gastos WHERE id = $1', [id]);
      } else if (month) {
        const startDate = `${month}-01T00:00:00.000Z`;
        const endDate = `${month}-31T23:59:59.999Z`;
        await pool.query('DELETE FROM gastos WHERE fecha >= $1 AND fecha <= $2', [startDate, endDate]);
      } else {
        return res.status(400).json({ error: 'Falta parametro id o month' });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (error) {
    console.error('Error DB en gastos.js:', error);
    return res.status(500).json({ error: error.message });
  }
}