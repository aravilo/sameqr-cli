// Aufrufe an https://sameqr.com/api/v1 — mit dem fetch von Node 18+, ohne
// weitere Pakete.
export class ApiFehler extends Error {
  constructor(status, fehler) {
    super(fehler?.message || `HTTP ${status}`)
    this.status = status
    this.code = fehler?.code || 'FEHLER'
    this.details = fehler?.details
  }
}

export async function rufe({ api, schluessel }, methode, weg, body, extraKopf = {}) {
  if (!/^https:\/\//.test(api) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(api)) {
    // Ein Schluessel geht nie unverschluesselt ueber das Netz.
    throw new ApiFehler(0, { code: 'NUR_HTTPS', message: `Nur https:// (oder http://localhost): ${api}` })
  }
  const kopf = { Accept: 'application/json', 'User-Agent': 'sameqr-cli/0.1' }
  if (schluessel) kopf.Authorization = `Bearer ${schluessel}`
  if (body !== undefined) kopf['Content-Type'] = 'application/json'
  Object.assign(kopf, extraKopf)
  let antwort
  try {
    antwort = await fetch(`${api}/api/v1${weg}`, {
      method: methode,
      headers: kopf,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'error',
    })
  } catch (e) {
    throw new ApiFehler(0, { code: 'NETZ', message: `Keine Verbindung zu ${api} (${e.cause?.code || e.message})` })
  }
  const text = await antwort.text()
  let daten = null
  try { daten = text ? JSON.parse(text) : null } catch {
    throw new ApiFehler(antwort.status, { code: 'KEIN_JSON', message: `Unerwartete Antwort (HTTP ${antwort.status})` })
  }
  if (!antwort.ok) {
    const f = daten?.error && typeof daten.error === 'object' ? daten.error : { message: daten?.error || `HTTP ${antwort.status}` }
    if (antwort.status === 429 && antwort.headers.get('retry-after')) {
      f.details = { ...(f.details || {}), retryAfter: Number(antwort.headers.get('retry-after')) }
    }
    throw new ApiFehler(antwort.status, f)
  }
  return daten
}
