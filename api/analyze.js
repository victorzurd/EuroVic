export default async function handler(req, res) {
  // Configuración CORS para recibir peticiones desde tu app o atajos
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Permite recibir el texto tanto por POST como por parámetro GET
  const texto = req.method === 'POST' ? req.body?.text : req.query?.text;

  if (!texto) {
    return res.status(400).json({ error: 'Texto de notificación no proporcionado' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada en las variables de Vercel' });
  }

  const promptText = `Analiza la siguiente notificación bancaria y extrae los detalles del gasto.
Notificación: "${texto}"

Responde ÚNICAMENTE con un objeto JSON estricto con esta estructura:
{
  "comercio": "Nombre limpio de la tienda o servicio (ej. Zara, Sephora, Starbucks, Uber, Mercadona)",
  "monto": 0.00,
  "categoria": "Elige exactamente una: 'Shopping', 'Self Care', 'Brunch', 'Fiesta', 'Movilidad', 'Varios'",
  "emoji": "Emoji representativo"
}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error API Gemini: ${errText}`);
    }

    const data = await response.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawJson) {
      throw new Error('Respuesta vacía de Gemini');
    }

    const parsedData = JSON.parse(rawJson);
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error('Error analizando notificación:', error);
    return res.status(500).json({ error: 'Error procesando la notificación con Gemini' });
  }
}