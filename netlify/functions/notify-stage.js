const ADMIN_EMAILS = [
  'antoine@mecanoalca.ca',
  'bruno@mecanoalca.ca',
  'donald@mecanoalca.ca',
]

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { error: 'JSON invalide' })
  }

  const { projectNumber, clientName, stageName, action } = body
  const done = action !== 'reopen'
  const subject = done
    ? `ALCA Prod — Étape terminée : ${projectNumber}`
    : `ALCA Prod — Étape réouverte : ${projectNumber}`
  const text = done
    ? `Projet ${projectNumber} — ${clientName}\nÉtape ${stageName} terminée.`
    : `Projet ${projectNumber} — ${clientName}\nÉtape ${stageName} réouverte.`

  const apiKey = (process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) {
    return json(200, { emailed: false, reason: 'RESEND_API_KEY manquante' })
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'ALCA Prod <onboarding@resend.dev>',
        to: ADMIN_EMAILS,
        subject,
        text,
      }),
    })
    const data = await res.json()
    if (!res.ok) return json(200, { emailed: false, reason: data.message || res.status })
    return json(200, { emailed: true, id: data.id })
  } catch (e) {
    return json(200, { emailed: false, reason: e.message })
  }
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...cors() },
    body: JSON.stringify(obj),
  }
}
