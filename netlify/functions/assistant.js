/**
 * Netlify Function: ALCA Prod assistant (xAI / Grok)
 * Env: XAI_API_KEY
 */

const SYSTEM = `Tu es l'assistant de production d'ALCA Prod (Mécano Alca, Québec).
Tu aides à planifier la fabrication de plateformes d'aluminium, sous-chassis, habillage et installation de grues Hiab sur camions.

Règles métier:
- Porte 8 = peinture (1). Portes 5+6 = Acier/Grue/Habillage, max 2 CAMIONS (pas 2 étapes). Jig = 1 alu. PDI/Tests hors porte.
- Acier → Peinture (pas ensemble) → Grue après peinture.
- Alu en parallèle mais on vise fin alu ≈ fin peinture (pas laisser le Jig bloqué des jours avant que le camion sorte).
- Habillage seulement après Alu ET Acier ET Peinture (camion + plate-forme prêts). Grue/Habillage overlap max 1 jour.
- PDI puis Tests après le gros œuvre. Jours ouvrables. Priorité en conflit.
- Porte 8 blocable.

Réponds en français. Base-toi sur le CONTEXTE. Si l'utilisateur veut CHANGER le calendrier, propose 2 ou 3 OPTIONS clairement (impacts: Jig, priorité, retard d'un autre client). Termine alors par UNE ligne:
OPTIONS:[{"title":"...","detail":"...","actions":[{"type":"pin_stage","project_number":"59845","stage_slug":"aluminium","start_date":"2026-09-28"}]}]
Types d'actions:
- pin_stage (project_number, stage_slug: acier|peinture|aluminium|grue|habillage|pdi|tests, start_date)
- block_porte_8 (start_date, end_date, reason)
- reoptimize
Après choix humain, le client applique. Une petite action unique peut encore utiliser:
ACTION:{"type":"block_porte_8",...}`

const MODELS = ['grok-4.3', 'grok-4.5', 'grok-4.6']

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const apiKey = (process.env.XAI_API_KEY || '').trim()
  if (!apiKey) {
    return json(500, {
      error:
        'XAI_API_KEY manquante sur Netlify. Vérifie Site settings → Environment variables, puis redéploie.',
    })
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

  const ctx =
    typeof context === 'string' && context.trim()
      ? context.trim().slice(0, 8000)
      : ''

  const contextBlock = ctx
    ? `\n\n--- CONTEXTE ALCA PROD (données actuelles) ---\n${ctx}\n--- FIN CONTEXTE ---`
    : ''

  const xaiMessages = [
    { role: 'system', content: SYSTEM + contextBlock },
    ...messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-10)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) })),
  ]

  let lastError = 'Erreur xAI inconnue'

  for (const model of MODELS) {
    try {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: xaiMessages,
          temperature: 0.3,
        }),
      })

      const raw = await res.text()
      let data = {}
      try {
        data = JSON.parse(raw)
      } catch {
        lastError = `xAI non-JSON (${res.status}): ${raw.slice(0, 200)}`
        continue
      }

      if (!res.ok) {
        lastError =
          (typeof data.error === 'string' ? data.error : null) ||
          data.error?.message ||
          data.message ||
          raw.slice(0, 300) ||
          `xAI HTTP ${res.status}`
        // try next model
        continue
      }

      const content = data.choices?.[0]?.message?.content || ''
      const action = parseAction(content)
      const options = parseOptions(content)
      const clean = content
        .replace(/\n?OPTIONS:\[[\s\S]*\]\s*$/m, '')
        .replace(/\n?ACTION:\{[\s\S]*\}\s*$/m, '')
        .trim()

      return json(200, { reply: clean || '(réponse vide)', action, options, model })
    } catch (e) {
      lastError = e.message || String(e)
    }
  }

  return json(502, { error: lastError })
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

function parseOptions(text) {
  const m = text.match(/OPTIONS:(\[[\s\S]*\])\s*$/m)
  if (!m) return []
  try {
    const arr = JSON.parse(m[1])
    return Array.isArray(arr) ? arr.slice(0, 4) : []
  } catch {
    return []
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
