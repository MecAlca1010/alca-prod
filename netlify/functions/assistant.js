/**
 * Netlify Function: ALCA Prod assistant (xAI / Grok)
 * Env: XAI_API_KEY
 */

const SYSTEM = `Tu es l'assistant de production d'ALCA Prod (Mécano Alca, Québec).
Tu aides à planifier la fabrication de plateformes d'aluminium, sous-chassis, habillage et installation de grues Hiab sur camions.

Règles métier importantes:
- Portes: Porte 8 = peinture (1 camion). Portes 5+6 = polyvalentes (Acier, Grue, Habillage), max 2 camions. Jig = 1 plate-forme alu. PDI/Tests hors porte.
- Dépendances: Acier avant Peinture (pas de chevauchement); Grue après sortie peinture; Habillage après Alu terminé; Grue/Habillage chevauchement max 1 jour ouvrable; PDI puis Tests après le gros œuvre.
- Jours ouvrables lun–ven. Priorité projet en cas de conflit.
- Porte 8 peut être bloquée (réparations).

Réponds en français, de façon claire et concrète. Base-toi UNIQUEMENT sur le CONTEXTE fourni (projets, calendrier, blocages). Si une info manque, dis-le.

Quand l'utilisateur demande une action que tu peux proposer, termine ta réponse par UNE ligne exactement de ce format (sinon n'inclus pas de ligne ACTION):
ACTION:{"type":"block_porte_8","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","reason":"..."}
Types supportés pour l'instant:
- block_porte_8 (start_date, end_date, reason)
Ne propose une ACTION que si la demande est claire. L'humain confirmera avant exécution.`

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    return json(500, { error: 'XAI_API_KEY manquante sur Netlify (Environment variables)' })
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { error: 'JSON invalide' })
  }

  const { messages, context } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return json(400, { error: 'messages requis' })
  }

  const contextBlock =
    typeof context === 'string' && context.trim()
      ? `\n\n--- CONTEXTE ALCA PROD (données actuelles) ---\n${context.slice(0, 12000)}\n--- FIN CONTEXTE ---`
      : ''

  const xaiMessages = [
    { role: 'system', content: SYSTEM + contextBlock },
    ...messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content })),
  ]

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4.3',
        messages: xaiMessages,
        temperature: 0.3,
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg =
        (typeof data.error === 'string' ? data.error : null) ||
        data.error?.message ||
        data.message ||
        JSON.stringify(data).slice(0, 300) ||
        `xAI HTTP ${res.status}`
      return json(502, { error: msg })
    }

    const content = data.choices?.[0]?.message?.content || ''
    const action = parseAction(content)
    const clean = content.replace(/\n?ACTION:\{[\s\S]*\}\s*$/m, '').trim()

    return json(200, { reply: clean, action })
  } catch (e) {
    return json(500, { error: e.message || 'Erreur assistant' })
  }
}

function parseAction(text) {
  const m = text.match(/ACTION:(\{[\s\S]*\})\s*$/m)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(obj),
  }
}
