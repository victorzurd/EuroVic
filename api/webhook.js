import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Falta el texto del mensaje' });

  try {
    const gasto = await analizarGastoConGemini(text);

    if (!gasto || !gasto.monto) {
      return res.status(400).json({ error: 'No se pudo detectar un importe válido en el texto' });
    }

    const query = `
      INSERT INTO gastos (comercio, monto, categoria, emoji, fecha)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [gasto.comercio, gasto.monto, gasto.categoria, gasto.emoji, new Date().toISOString()];

    const { rows } = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      mensaje: `${gasto.emoji} ${gasto.comercio}: -${gasto.monto.toFixed(2)}€ (${gasto.categoria})`,
      gasto: rows[0]
    });

  } catch (error) {
    console.error('Error en webhook.js:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function analizarGastoConGemini(texto) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const match = texto.match(/(\d+[\.,]?\d*)\s*(?:€|EUR|euros)/i) || texto.match(/(?:pago|compra|importe) (?:de )?(\d+[\.,]?\d*)/i);
    const monto = match ? parseFloat(match[1].replace(',', '.')) : 0;
    return { comercio: 'Compra Detectada', monto, categoria: 'Varios', emoji: '✨' };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `Extrae la información del gasto bancario del siguiente texto de correo/notificación:\n"${texto}"` }]
            }
          ],
          generationConfig: {
            response_mime_type: 'application/json',
            response_schema: {
              type: 'OBJECT',
              properties: {
                comercio: { type: 'STRING' },
                monto: { type: 'NUMBER' },
                categoria: { 
                  type: 'STRING', 
                  enum: [
                    'Shopping',
                    'Self Care',
                    'Brunch & Desayunos',
                    'Cenas & Copas',
                    'Fiesta & Eventos',
                    'Supermercado',
                    'Escapadas',
                    'Movilidad',
                    'Varios'
                  ] 
                },
                emoji: { type: 'STRING' }
              },
              required: ['comercio', 'monto', 'categoria', 'emoji']
            }
          }
        })
      }
    );

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return resultText ? JSON.parse(resultText) : null;
  } catch (err) {
    console.error('Error al invocar la API de Gemini:', err);
    return null;
  }
}