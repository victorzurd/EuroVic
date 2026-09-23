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

// Lista exacta de categorías permitidas en tu Frontend
const CATEGORIAS_VALIDAS = {
  'Shopping': '🛍️',
  'Self Care': '💅',
  'Brunch & Desayunos': '🥐',
  'Cenas & Copas': '🍷',
  'Fiesta & Eventos': '🎉',
  'Supermercado': '🛒',
  'Escapadas': '✈️',
  'Movilidad': '🚗',
  'Varios': '✨'
};

// Función para forzar que el texto siempre coincida con una categoría del Frontend
function normalizarCategoria(catRaw) {
  if (!catRaw) return 'Varios';
  const str = catRaw.toString().trim().toLowerCase();

  if (/super|mercadona|carrefour|lidl|alcampo|dia|consum|eroski|alimen|compra/i.test(str)) return 'Supermercado';
  if (/zara|sephora|mango|shopping|ropa|tienda|moda|pull|bershka/i.test(str)) return 'Shopping';
  if (/uber|cabify|renfe|movil|transporte|gasolin|repsol|bp|cepsa|auto/i.test(str)) return 'Movilidad';
  if (/brunch|desayun|cafe|starbucks|panaderia/i.test(str)) return 'Brunch & Desayunos';
  if (/cena|copa|restaurante|bar|mcdonald/i.test(str)) return 'Cenas & Copas';
  if (/fiesta|evento|pub|disco/i.test(str)) return 'Fiesta & Eventos';
  if (/escapad|viaje|vuelo|hotel/i.test(str)) return 'Escapadas';
  if (/care|salud|belleza|pelu/i.test(str)) return 'Self Care';

  return 'Varios';
}

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
    const gastoRaw = await analizarGastoConGemini(texto);

    if (!gastoRaw || !gastoRaw.monto || isNaN(gastoRaw.monto) || gastoRaw.monto <= 0) {
      return res.status(400).json({
        error: 'No se pudo detectar un importe/monto válido en el texto provisto.',
        textoProcesado: texto
      });
    }

    // Normalización estricta antes de guardar en Postgres
    const categoriaFinal = normalizarCategoria(gastoRaw.categoria);
    const emojiFinal = CATEGORIAS_VALIDAS[categoriaFinal] || '✨';

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
    return res.status(500).json({ error: error.message });
  }
}

function extraerGastoPorRegex(texto) {
  const matchMonto = texto.match(/(\d+[\.,]?\d*)\s*(?:€|EUR|euros)/i) || 
                     texto.match(/(?:pago|compra|importe) (?:de )?(\d+[\.,]?\d*)/i);
  
  const monto = matchMonto ? parseFloat(matchMonto[1].replace(',', '.')) : 0;

  let comercio = 'Compra Detectada';
  const matchComercio = texto.match(/(?:en|de)\s+([A-Za-z0-9\s]+?)(?:\s+\d+|\s*$)/i);
  if (matchComercio && matchComercio[1]) {
    comercio = matchComercio[1].trim();
  }

  const categoria = normalizarCategoria(texto);

  return { 
    comercio: comercio.toLowerCase().includes('compra') && texto.toLowerCase().includes('mercadona') ? 'Mercadona' : comercio, 
    monto, 
    categoria, 
    emoji: CATEGORIAS_VALIDAS[categoria] 
  };
}

async function analizarGastoConGemini(texto) {
  let apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    apiKey = apiKey.trim().replace(/^["']|["']$/g, '');
  }

  if (!apiKey) {
    return extraerGastoPorRegex(texto);
  }

  // Se requiere v1beta para la validación estricta del Schema JSON
  const model = 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const promptText = `Extrae la información del gasto bancario del siguiente texto:
"${texto}"`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: {
            type: 'OBJECT',
            properties: {
              comercio: { type: 'STRING' },
              monto: { type: 'NUMBER' },
              categoria: { 
                type: 'STRING', 
                enum: ['Shopping', 'Self Care', 'Brunch & Desayunos', 'Cenas & Copas', 'Fiesta & Eventos', 'Supermercado', 'Escapadas', 'Movilidad', 'Varios'] 
              },
              emoji: { type: 'STRING' }
            },
            required: ['comercio', 'monto', 'categoria', 'emoji']
          }
        }
      })
    });

    if (!response.ok) {
      console.warn(`Gemini API respondió con HTTP ${response.status}. Usando fallback Regex.`);
      return extraerGastoPorRegex(texto);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    return resultText ? JSON.parse(resultText) : extraerGastoPorRegex(texto);

  } catch (err) {
    console.warn('Excepción invocando Gemini API, usando fallback Regex:', err);
    return extraerGastoPorRegex(texto);
  }
}