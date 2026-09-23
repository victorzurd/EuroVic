export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { text } = req.body || {};
  if (!text) {
    return res.status(400).json({ error: 'Texto no proporcionado' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json(extraerFallback(text));
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `Extrae la información del gasto de esta notificación bancaria:\n"${text}"` }]
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
                  enum: ['Shopping', 'Self Care', 'Brunch', 'Fiesta', 'Movilidad', 'Varios'] 
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
    if (!resultText) return res.status(200).json(extraerFallback(text));

    return res.status(200).json(JSON.parse(resultText));
  } catch (error) {
    console.error('Error al analizar con Gemini:', error);
    return res.status(200).json(extraerFallback(text));
  }
}

function extraerFallback(text) {
  const match = text.match(/(\d+[\.,]?\d*)\s*(?:€|EUR|euros)/i) || text.match(/(?:pago|compra|importe) (?:de )?(\d+[\.,]?\d*)/i);
  const monto = match ? parseFloat(match[1].replace(',', '.')) : 0;
  return {
    comercio: 'Compra Detectada',
    monto: monto,
    categoria: 'Varios',
    emoji: '✨'
  };
}