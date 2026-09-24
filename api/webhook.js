import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.POSTGRES_SUPABASE_URL;
  const supabaseServiceKey = process.env.POSTGRES_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Faltan las variables POSTGRES_SUPABASE_URL o POSTGRES_SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

const CATEGORIAS_VALIDAS = {
  'Shopping': '🛍️',
  'Self Care': '💅',
  'Brunch & Desayunos': '🥐',
  'Cenas & Copas': '🍷',
  'Fiesta & Eventos': '🎉',
  'Ocio': '🎟️',
  'Supermercado': '🛒',
  'Escapadas': '✈️',
  'Movilidad': '🚗',
  'Varios': '✨'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = { text: body };
    }
  }

  const texto = body?.text || body?.notificacion || body?.message || body?.contenido || req.query?.text;

  if (!texto || typeof texto !== 'string' || !texto.trim()) {
    return res.status(400).json({ error: 'No se recibió ningún texto válido para analizar.' });
  }

  try {
    const supabase = getSupabaseClient();
    
    // 1. Procesar el texto de forma directa usando exclusivamente Groq (Llama 3)
    const gastoRaw = await analizarGastoConGroq(texto);

    if (!gastoRaw || !gastoRaw.monto || isNaN(parseFloat(gastoRaw.monto)) || parseFloat(gastoRaw.monto) <= 0) {
      return res.status(400).json({
        error: 'No se pudo extraer un monto válido del texto mediante Groq.',
        textoProcesado: texto,
        respuestaIA: gastoRaw
      });
    }

    // 2. Normalizar la categoría devuelta por la IA
    const categoriaFinal = CATEGORIAS_VALIDAS[gastoRaw.categoria] ? gastoRaw.categoria : 'Varios';
    const emojiFinal = CATEGORIAS_VALIDAS[categoriaFinal] || '✨';

    // 3. Guardar el gasto procesado en Supabase
    const { data, error } = await supabase
      .from('gastos')
      .insert([
        {
          comercio: gastoRaw.comercio || 'Compra Detectada',
          monto: parseFloat(gastoRaw.monto),
          categoria: categoriaFinal,
          emoji: emojiFinal,
          fecha: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      mensaje: `${emojiFinal} ${data.comercio}: -${data.monto.toFixed(2)}€ (${categoriaFinal})`,
      gasto: data
    });

  } catch (error) {
    console.error('Error en webhook.js:', error);
    return res.status(500).json({ error: `[ERROR] ${error.message}` });
  }
}

async function analizarGastoConGroq(texto) {
  let apiKey = process.env.GROQ_API_KEY;

  if (apiKey) {
    apiKey = apiKey.trim().replace(/^["']|["']$/g, '');
  }

  if (!apiKey) {
    throw new Error('Falta la variable de entorno GROQ_API_KEY en Vercel.');
  }

  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const systemPrompt = `Eres un asistente especializado en extraer información estructurada de notificaciones de gastos bancarios.
Debes devolver ÚNICAMENTE un objeto JSON válido, sin bloques de formato Markdown (NO uses \`\`\`json ni \`\`\`), sin introducciones ni texto adicional.

Esquema JSON obligatorio:
{
  "comercio": "Nombre del establecimiento o comercio",
  "monto": 0.0,
  "categoria": "Una categoría de la lista permitida",
  "emoji": "El emoji de la categoría seleccionada"
}

Las ÚNICAS categorías permitidas y sus emojis asociados son:
- Shopping (🛍️)
- Self Care (💅)
- Brunch & Desayunos (🥐)
- Cenas & Copas (🍷)
- Fiesta & Eventos (🎉)
- Ocio (🎟️)
- Supermercado (🛒)
- Escapadas (✈️)
- Movilidad (🚗)
- Varios (✨)

Reglas:
1. "monto" debe ser estrictamente un número flotante/decimal (ejemplo: 12.50).
2. Si la categoría no coincide claramente con ninguna, asigna "Varios" y "✨".`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analiza esta notificación o texto: "${texto}"` }
      ],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq API respondió HTTP ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  let resultText = data.choices?.[0]?.message?.content;

  if (!resultText) {
    throw new Error('Groq API devolvió una respuesta vacía.');
  }

  // Limpieza de seguridad por si el modelo incluye comillas o etiquetas markdown ```json
  resultText = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();

  return JSON.parse(resultText);
}