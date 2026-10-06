// Ablage des Schluessels: ~/.config/sameqr/config.json, nur fuer den
// Besitzer lesbar (0600, Ordner 0700). SAMEQR_API_KEY hat Vorrang und wird
// nie in die Datei geschrieben.
//
// Der Schluessel kommt NIE ueber die Befehlszeile (argv steht in der
// Prozessliste und in der Shell-Historie) — nur verdeckt getippt, ueber stdin
// oder ueber die Umgebungsvariable.
//
// Zwei Schutzmassnahmen aus dem Audit vom 06.10.2026:
//   MCP-9  Ein gespeicherter Schluessel ist an die Adresse gebunden, bei der
//          er angemeldet wurde. Eine andere Adresse (--api, SAMEQR_API_URL)
//          bekommt ihn nie — sonst schickte ein untergeschobenes
//          SAMEQR_API_URL den Schluessel an einen fremden Server.
//   MCP-10 Geschrieben wird ueber eine neue Datei (O_EXCL, 0600) und
//          rename; Ordner und Datei duerfen keine Verweise (Symlinks) sein
//          und muessen dem eigenen Benutzer gehoeren.
import { mkdirSync, readFileSync, writeFileSync, chmodSync, lstatSync, rmSync, renameSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export const STANDARD_API = 'https://sameqr.com'

export class KonfigFehler extends Error {
  constructor(code, message) { super(message); this.code = code }
}

export function konfigOrdner(env = process.env) {
  const basis = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.startsWith('/') ? env.XDG_CONFIG_HOME : join(homedir(), '.config')
  return join(basis, 'sameqr')
}

export const konfigDatei = (env = process.env) => join(konfigOrdner(env), 'config.json')

const eigeneUid = () => (typeof process.getuid === 'function' ? process.getuid() : null)

// Darf dieser Pfad benutzt werden? Kein Verweis, eigener Besitzer.
function pruefePfad(pfad) {
  let st
  try { st = lstatSync(pfad) } catch { return false }
  if (st.isSymbolicLink()) throw new KonfigFehler('UNSICHER', `${pfad} ist ein Verweis (Symlink) – aus Sicherheitsgründen nicht benutzt.`)
  const uid = eigeneUid()
  if (uid !== null && st.uid !== uid) throw new KonfigFehler('UNSICHER', `${pfad} gehört einem anderen Benutzer – aus Sicherheitsgründen nicht benutzt.`)
  return true
}

export function liesKonfig(env = process.env) {
  const datei = konfigDatei(env)
  if (!existsSync(datei) && !(() => { try { return lstatSync(datei).isSymbolicLink() } catch { return false } })()) return {}
  pruefePfad(konfigOrdner(env))
  pruefePfad(datei)
  try {
    // Zu weit offen (z. B. nach einem Kopieren): enger stellen statt nur warnen.
    const modus = lstatSync(datei).mode & 0o777
    if (modus & 0o077) chmodSync(datei, 0o600)
    const k = JSON.parse(readFileSync(datei, 'utf8'))
    return k && typeof k === 'object' ? k : {}
  } catch {
    return {}
  }
}

export function schreibeKonfig(werte, env = process.env) {
  const ordner = konfigOrdner(env)
  mkdirSync(ordner, { recursive: true, mode: 0o700 })
  pruefePfad(ordner)
  chmodSync(ordner, 0o700)
  const datei = konfigDatei(env)
  if (existsSync(datei) || (() => { try { return lstatSync(datei).isSymbolicLink() } catch { return false } })()) pruefePfad(datei)
  // Neue Datei mit zufaelligem Namen, exklusiv angelegt (wx = O_CREAT|O_EXCL,
  // folgt keinem Verweis), dann an ihren Platz geschoben.
  const temp = join(ordner, `.config.${randomBytes(6).toString('hex')}.tmp`)
  writeFileSync(temp, JSON.stringify(werte, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  chmodSync(temp, 0o600)
  renameSync(temp, datei)
  return datei
}

export function loescheKonfig(env = process.env) {
  const datei = konfigDatei(env)
  if (existsSync(datei)) { pruefePfad(datei); rmSync(datei) }
  return datei
}

export function schluesselGueltig(s) {
  return typeof s === 'string' && /^(sqr_|sqo_)[A-Za-z0-9_-]{20,200}$/.test(s)
}

export function ursprung(adresse) {
  try { return new URL(adresse).origin } catch { return null }
}

// Adressen, an die ein Schluessel ohne Nachfrage geht: nur sameqr.com
// (Audit R2). Der eigene Rechner nur beim Anmelden und nur mit
// ausdruecklichem Port — danach ist der Schluessel an genau diese Adresse
// gebunden.
export function vertrauteAdresse(adresse) {
  return ursprung(adresse) === STANDARD_API
}
export function vertrautZumAnmelden(adresse) {
  const roh = String(adresse || '')
  return vertrauteAdresse(roh) || /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}\/?$/.test(roh)
}

// Woher Schluessel und Adresse kommen: Umgebung vor Datei. Wirft, wenn der
// Schluessel an eine Adresse ginge, fuer die er nicht gedacht ist.
export function zugang(env = process.env, flags = {}) {
  const k = liesKonfig(env)
  const gewuenscht = flags.api || env.SAMEQR_API_URL || null
  const fremdErlaubt = !!flags['allow-foreign-api']
  if (env.SAMEQR_API_KEY) {
    const api = String(gewuenscht || STANDARD_API).replace(/\/+$/, '')
    if (!vertrauteAdresse(api) && !fremdErlaubt) {
      throw new KonfigFehler('FREMDE_API', `Der Schlüssel würde an ${ursprung(api) || api} gehen. Nur mit --allow-foreign-api.`)
    }
    return { api, schluessel: String(env.SAMEQR_API_KEY).trim(), quelle: 'env' }
  }
  if (k.schluessel) {
    const gebunden = String(k.api || STANDARD_API).replace(/\/+$/, '')
    if (gewuenscht && ursprung(gewuenscht) !== ursprung(gebunden)) {
      throw new KonfigFehler('FREMDE_API', `Der gespeicherte Schlüssel gehört zu ${ursprung(gebunden)}, nicht zu ${ursprung(gewuenscht) || gewuenscht}. Für eine andere Adresse neu anmelden.`)
    }
    return { api: gebunden, schluessel: k.schluessel, quelle: 'datei' }
  }
  const api = String(gewuenscht || STANDARD_API).replace(/\/+$/, '')
  return { api, schluessel: null, quelle: null }
}
