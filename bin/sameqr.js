#!/usr/bin/env node
// sameqr – Same-QR von der Kommandozeile. Ohne Abhaengigkeiten, Node >= 18.
import { readFileSync, statSync, realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { basename, extname } from 'node:path'
import { TEXTE, sprache } from '../lib/texte.js'
import { createInterface } from 'node:readline'
import { zugang, schreibeKonfig, loescheKonfig, schluesselGueltig, konfigDatei, KonfigFehler, STANDARD_API, vertrautZumAnmelden, ursprung } from '../lib/konfig.js'
import { rufe, ApiFehler } from '../lib/api.js'
import { ersetzeSteuerzeichen } from '../lib/steuerzeichen.js'

// Fuer Terminal und JSON: alles aus der Liste; Zeilenumbruch/Tab bleiben
// (in JSON-Zeichenketten stehen sie ohnehin schon als \n und \t).


const VERSION = '0.1.0'

// --- Argumente ---------------------------------------------------------------
// Bewusst schlicht: --name wert, --name=wert, Schalter ohne Wert, Wiederholung
// sammelt (--label a --label b).
const SCHALTER = new Set(['json', 'yes', 'stdin', 'offline', 'help', 'version', 'h', 'v', 'allow-foreign-api'])
export function zerlege(argv) {
  const pos = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') { pos.push(...argv.slice(i + 1)); break }
    const m = /^--?([a-zA-Z][\w-]*)(?:=(.*))?$/.exec(a)
    if (!m) { pos.push(a); continue }
    const name = m[1]
    let wert = m[2]
    if (wert === undefined) {
      if (SCHALTER.has(name)) wert = true
      else if (i + 1 < argv.length) wert = argv[++i]
      else wert = ''
    }
    if (name in flags) flags[name] = [].concat(flags[name], wert)
    else flags[name] = wert
  }
  return { pos, flags }
}

const liste = w => (w === undefined ? undefined : [].concat(w).filter(x => x !== true && x !== ''))

// --- Ausgabe -------------------------------------------------------------------
let T = TEXTE.en
let alsJson = false
// Steuerzeichen aus allem, was im Terminal erscheint (Audit 06.10. MCP-8):
// Codenamen, Seitentexte und Anfragen schreiben andere Leute. Eine ESC-Folge
// darin koennte das Terminal umfaerben, den Titel setzen oder Text verstecken;
// Richtungswechsel (Bidi) drehen die Anzeige um. C0 ausser Zeilenumbruch und
// Tab, C1, Bidi, Null-Breite und BOM werden zu "?".
export const sauber = text => ersetzeSteuerzeichen(text, () => '?', { mehrzeilig: true })
// In einer Tabellenzelle auch kein Zeilenumbruch und kein Tab.
const zelle = text => sauber(String(text).replace(/[\n\t\r]/g, ' '))
const aus = s => process.stdout.write(sauber(s) + '\n')
// JSON ist fuer Programme: Der Inhalt bleibt derselbe, aber jedes Zeichen der
// Liste steht als \uXXXX-Folge da (Audit R2-3) — wer die Ausgabe nur im
// Terminal ansieht, bekommt keine Steuerfolgen, ein Programm liest dieselben
// Zeichen wie vorher.
const maskiere = text => ersetzeSteuerzeichen(text, z => [...z].map(e => {
  const c = e.codePointAt(0)
  if (c <= 0xffff) return '\\u' + c.toString(16).padStart(4, '0')
  const v = c - 0x10000
  return '\\u' + (0xd800 + (v >> 10)).toString(16) + '\\u' + (0xdc00 + (v & 0x3ff)).toString(16)
}).join(''), { mehrzeilig: true })
const json = d => process.stdout.write(maskiere(JSON.stringify(d, null, 2)) + '\n')

function tabelle(zeilen, spalten) {
  if (!zeilen.length) return aus(T.leer)
  const breite = spalten.map(([k, t]) => Math.min(48, Math.max(t.length, ...zeilen.map(z => zelle(z[k] ?? '').length))))
  aus(spalten.map(([, t], i) => t.padEnd(breite[i])).join('  '))
  for (const z of zeilen) aus(spalten.map(([k], i) => zelle(z[k] ?? '').slice(0, 48).padEnd(breite[i])).join('  '))
}

// --- Verdeckte Eingabe -----------------------------------------------------------
function frageVerdeckt(frage) {
  return new Promise((fertig, fehl) => {
    const ein = process.stdin
    if (!ein.isTTY) return fehl(new Error('stdin ist kein Terminal – nutze `sameqr login --stdin` oder SAMEQR_API_KEY.'))
    process.stderr.write(frage)
    ein.setRawMode(true)
    ein.resume()
    ein.setEncoding('utf8')
    let wert = ''
    const zu = () => { ein.setRawMode(false); ein.pause(); ein.removeListener('data', lies) }
    const lies = teil => {
      for (const z of teil) {
        if (z === '\r' || z === '\n') { zu(); process.stderr.write('\n'); return fertig(wert) }
        if (z === '\u0003') { zu(); process.stderr.write('\n'); process.exit(130) }
        if (z === '\u007f' || z === '\b') { wert = wert.slice(0, -1); continue }
        if (z >= ' ') wert += z
      }
    }
    ein.on('data', lies)
  })
}

async function liesStdin() {
  const teile = []
  for await (const t of process.stdin) teile.push(t)
  return Buffer.concat(teile).toString('utf8').trim()
}

// --- Hilfen fuer Befehle ----------------------------------------------------------
function pfadSlug(roh) {
  const m = /^([a-z]{2,20})\/([a-z0-9][a-z0-9.-]{0,99})$/.exec(String(roh || '').replace(/^\/+|\/+$/g, '').replace(/^s\//, ''))
  if (!m) throw new ApiFehler(0, { code: 'EINGABE', message: T.fehlt('<pfad/slug>, z. B. menu/zum-loewen') })
  return { pfad: m[1], slug: m[2] }
}

function brauche(wert, name) {
  if (wert === undefined || wert === true || wert === '') throw new ApiFehler(0, { code: 'EINGABE', message: T.fehlt(name) })
  return wert
}

const MEDIENTYPEN = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' }

function datei64(pfad) {
  const typ = MEDIENTYPEN[extname(pfad).toLowerCase()]
  if (!typ) throw new ApiFehler(0, { code: 'EINGABE', message: `${basename(pfad)}: JPG, PNG, WebP, GIF oder PDF` })
  let groesse
  try { groesse = statSync(pfad).size } catch { throw new ApiFehler(0, { code: 'EINGABE', message: T.dateiFehlt(pfad) }) }
  const grenze = typ === 'application/pdf' ? 6 * 1024 * 1024 : 5 * 1024 * 1024
  if (groesse > grenze) throw new ApiFehler(413, { code: 'ZU_GROSS', message: `${basename(pfad)}: > ${grenze / 1024 / 1024} MB` })
  return { base64: readFileSync(pfad).toString('base64'), medientyp: typ }
}

// --- Bestaetigung (Audit R2-10.6) -----------------------------------------------------
// Ziel aendern, offline nehmen, loeschen: Der Server verlangt den Stand, der
// vorher gelesen wurde (X-Confirm). Im Terminal fragen wir immer nach —
// --yes gilt nur, wenn KEIN Terminal dran ist (Skript, CI), und muss dort
// ausdruecklich gesetzt sein.
function frageJaNein(text) {
  return new Promise(fertig => {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    rl.question(sauber(text) + ' [j/N] ', antwort => { rl.close(); fertig(/^(j|ja|y|yes)$/i.test(String(antwort).trim())) })
  })
}
async function bestaetige(flags, text, holeStand) {
  const stand = await holeStand()
  if (!stand) throw new ApiFehler(404, { code: 'NICHT_GEFUNDEN', message: T.fehlt('stand') })
  if (process.stdin.isTTY) {
    if (!(await frageJaNein(text))) throw new ApiFehler(0, { code: 'ABGEBROCHEN', message: T.abgebrochen })
  } else if (!flags.yes) {
    throw new ApiFehler(0, { code: 'BESTAETIGEN', message: T.bestaetigen })
  }
  return { 'X-Confirm': stand }
}

// --- Befehle -------------------------------------------------------------------------
// Seite aendern: Biegt das an einer veroeffentlichten Seite Ziele um, will der
// Server eine Bestaetigung — dann fragen und mit dem Stand noch einmal.
async function seitePatch(k, flags, pfad, slug, body) {
  try {
    return await rufe(k, 'PATCH', `/seiten/${pfad}/${slug}`, body)
  } catch (e) {
    if (!(e instanceof ApiFehler) || e.code !== 'BESTAETIGUNG_FEHLT') throw e
    const kopf = await bestaetige(flags, T.seiteZielFrage(`${pfad}/${slug}`), async () => (await rufe(k, 'GET', `/seiten/${pfad}/${slug}`)).seite?.stand)
    return rufe(k, 'PATCH', `/seiten/${pfad}/${slug}`, body, kopf)
  }
}

async function befehl(pos, flags, env) {
  const [b0] = pos
  // Beim Anmelden zaehlt die gespeicherte Bindung nicht — es wird neu gebunden.
  const z = b0 === 'login' && !env.SAMEQR_API_KEY ? { api: String(flags.api || env.SAMEQR_API_URL || STANDARD_API).replace(/\/+$/, ''), schluessel: null } : zugang(env, flags)
  const mitSchluessel = () => {
    if (!z.schluessel) throw new ApiFehler(401, { code: 'NICHT_ANGEMELDET', message: T.keinSchluessel })
    return z
  }
  const [b, u, ...rest] = pos

  if (b === 'login') {
    if (env.SAMEQR_API_KEY && !flags.stdin) {
      const ich = await rufe(mitSchluessel(), 'GET', '/konto')
      return alsJson ? json({ uid: ich.uid, quelle: 'env' }) : aus(`${T.envAktiv} (${ich.uid})`)
    }
    const schluessel = flags.stdin ? await liesStdin() : (await frageVerdeckt(T.schluesselFrage)).trim()
    if (!schluesselGueltig(schluessel)) throw new ApiFehler(0, { code: 'FORMAT', message: T.schluesselFormat })
    // Erst pruefen, dann speichern: Ein vertippter Schluessel soll nicht
    // liegen bleiben und beim naechsten Aufruf ein raetselhaftes 401 liefern.
    // Nur an sameqr.com oder den eigenen Rechner, sonst ausdruecklich
    // (Audit MCP-9). Gespeichert wird der Schluessel zusammen mit dieser
    // Adresse und geht spaeter nur dorthin.
    if (!vertrautZumAnmelden(z.api) && !flags['allow-foreign-api']) {
      throw new KonfigFehler('FREMDE_API', `Anmelden bei ${ursprung(z.api) || z.api}? Nur mit --allow-foreign-api.`)
    }
    const ich = await rufe({ api: z.api, schluessel }, 'GET', '/konto')
    const datei = schreibeKonfig({ schluessel, api: ursprung(z.api) }, env)
    return alsJson ? json({ uid: ich.uid, plan: ich.plan, datei }) : aus(T.gespeichert(ich.uid, datei))
  }
  if (b === 'logout') {
    const datei = loescheKonfig(env)
    return alsJson ? json({ ok: true, datei }) : aus(T.abgemeldet(datei))
  }
  if (b === 'whoami') {
    const ich = await rufe(mitSchluessel(), 'GET', '/konto')
    if (alsJson) return json(ich)
    // Interne Kennung 'business' heisst fuer Kunden "Agentur" (lib/plans.js).
    const tarif = x => ({ free: 'Free', start: 'Start', pro: 'Pro', business: 'Agentur' }[x] || x)
    return aus(`${ich.uid}\nplan: ${tarif(ich.plan)}${ich.effectivePlan && ich.effectivePlan !== ich.plan ? ` (${tarif(ich.effectivePlan)})` : ''}\nlimit: ${ich.limit ?? '∞'}`)
  }
  if (b === 'mcp') {
    return alsJson ? json({ url: `${z.api}/api/mcp` }) : aus(T.mcp(z.api))
  }

  if (b === 'qr') {
    const k = mitSchluessel()
    if (u === 'list') {
      const d = await rufe(k, 'GET', '/qr')
      return alsJson ? json(d) : tabelle(d.codes, [['id', 'ID'], ['name', 'Name'], ['targetUrl', 'Ziel/Target'], ['scanCount', 'Scans']])
    }
    if (u === 'get') return json(await rufe(k, 'GET', `/qr/${encodeURIComponent(brauche(rest[0], '<id>'))}`))
    if (u === 'stats') {
      const d = await rufe(k, 'GET', `/qr/${encodeURIComponent(brauche(rest[0], '<id>'))}/stats`)
      return alsJson ? json(d) : aus(`${d.id}  ${d.name}\nscans: ${d.scans}\nziel geändert/target changes: ${d.zielAenderungen}${d.inaktiv ? '\ninaktiv/inactive' : ''}`)
    }
    if (u === 'create') {
      const body = { name: brauche(flags.name, '--name') }
      if (flags.url) body.targetUrl = flags.url
      if (flags.type) body.type = flags.type
      if (flags.slug) body.slug = flags.slug
      if (flags.tz) body.tz = flags.tz
      if (flags.label) body.labels = liste(flags.label)
      if (flags.projekt) body.projektId = flags.projekt
      if (flags.seite) { const { pfad, slug } = pfadSlug(flags.seite); Object.assign(body, { type: 'seite', seitePfad: pfad, seiteSlug: slug }) }
      const d = await rufe(k, 'POST', '/qr', body)
      return alsJson ? json(d) : aus(`${d.id}  ${d.targetUrl || ''}`)
    }
    if (u === 'update') {
      const id = brauche(rest[0], '<id>')
      const body = {}
      if (flags.url) body.targetUrl = flags.url
      if (flags.name) body.name = flags.name
      if (flags.label) body.labels = liste(flags.label)
      if (flags.rev !== undefined) body._rev = Number(flags.rev)
      if (flags.type) body.type = flags.type
      let kopf = {}
      if (body.targetUrl !== undefined || body.type !== undefined) {
        kopf = await bestaetige(flags, T.zielFrage(id, body.targetUrl || body.type), async () => (await rufe(k, 'GET', `/qr/${encodeURIComponent(id)}`)).stand)
      }
      const d = await rufe(k, 'PATCH', `/qr/${encodeURIComponent(id)}`, body, kopf)
      return alsJson ? json(d) : aus(`${d.id}  ${d.targetUrl || ''}`)
    }
    if (u === 'delete') {
      const id = brauche(rest[0], '<id>')
      const kopf = await bestaetige(flags, T.loeschFrage(id), async () => (await rufe(k, 'GET', `/qr/${encodeURIComponent(id)}`)).stand)
      const d = await rufe(k, 'DELETE', `/qr/${encodeURIComponent(id)}`, undefined, kopf)
      return alsJson ? json(d) : aus(T.geloescht)
    }
  }

  if (b === 'seite') {
    const k = mitSchluessel()
    if (u === 'list') {
      const d = await rufe(k, 'GET', '/seiten')
      if (alsJson) return json(d)
      return tabelle((d.seiten || []).map(s => ({ ...s, adresse: `${s.pfad}/${s.slug}`, online: s.veroeffentlicht ? '✓' : '–' })),
        [['adresse', 'pfad/slug'], ['vorlage', 'Vorlage'], ['online', 'Online'], ['aufrufe', 'Aufrufe/Views'], ['url', 'URL']])
    }
    if (u === 'create') {
      const d = await rufe(k, 'POST', '/seiten', { vorlage: brauche(flags.vorlage, '--vorlage'), name: flags.name || '', ...(flags.projekt ? { projektId: flags.projekt } : {}) })
      return alsJson ? json(d) : aus(`${d.seite.pfad}/${d.seite.slug}  ${d.seite.url}`)
    }
    if (u === 'get') {
      const { pfad, slug } = pfadSlug(rest[0])
      return json(await rufe(k, 'GET', `/seiten/${pfad}/${slug}`))
    }
    if (u === 'update') {
      const { pfad, slug } = pfadSlug(rest[0])
      const quelle = brauche(flags.datei, '--datei <änderung.json>')
      let body
      try { body = JSON.parse(quelle === '-' ? await liesStdin() : readFileSync(quelle, 'utf8')) } catch { throw new ApiFehler(0, { code: 'EINGABE', message: T.dateiFehlt(quelle) }) }
      const d = await seitePatch(k, flags, pfad, slug, body)
      return alsJson ? json(d) : aus(d.wartet ? T.wartet : `${d.seite.pfad}/${d.seite.slug}  ${d.seite.veroeffentlicht ? T.veroeffentlicht(d.seite.url) : 'Entwurf/draft'}`)
    }
    if (u === 'publish') {
      const { pfad, slug } = pfadSlug(rest[0])
      const kopf = flags.offline
        ? await bestaetige(flags, T.offlineFrage(`${pfad}/${slug}`), async () => (await rufe(k, 'GET', `/seiten/${pfad}/${slug}`)).seite?.stand)
        : {}
      const d = await rufe(k, 'POST', `/seiten/${pfad}/${slug}/${flags.offline ? 'offline' : 'veroeffentlichen'}`, {}, kopf)
      if (alsJson) return json(d)
      return aus(flags.offline ? T.offline : d.wartet ? T.wartet : T.veroeffentlicht(d.seite.url))
    }
    if (u === 'anfragen') {
      const { pfad, slug } = pfadSlug(rest[0])
      const d = await rufe(k, 'GET', `/seiten/${pfad}/${slug}/anfragen`)
      if (alsJson) return json(d)
      return tabelle((d.anfragen || []).map(a => ({ am: new Date(a.am).toISOString().slice(0, 16).replace('T', ' '), ...(a.werte || {}) })),
        [['am', 'Datum/Date'], ['name', 'Name'], ['email', 'E-Mail'], ['nachricht', 'Nachricht/Message']])
    }
  }

  if (b === 'karte' && u === 'import') {
    const k = mitSchluessel()
    if (!rest.length) throw new ApiFehler(0, { code: 'EINGABE', message: T.fehlt('<foto|pdf>') })
    const bilder = rest.map(datei64)
    const d = await rufe(k, 'POST', '/karte/import', { vorlage: flags.vorlage || 'speisekarte', bilder })
    let angehaengt = null
    if (flags.seite && d.gruppen?.length) {
      // Wie im Dashboard (components/SeitenBereich.js, uebernimmFoto): an das
      // Bestehende anhaengen, leere Gruppen weglassen, nie ueberschreiben.
      const { pfad, slug } = pfadSlug(flags.seite)
      const { seite } = await rufe(k, 'GET', `/seiten/${pfad}/${slug}`)
      const { vorlagen = [] } = await rufe(k, 'GET', '/seiten')
      const block = vorlagen.find(v => v.id === seite.vorlage)?.bloecke?.find(x => x.art === 'gruppen')
      if (!block) throw new ApiFehler(0, { code: 'VORLAGE', message: `${pfad}/${slug}: keine Gruppen in dieser Vorlage` })
      const bisher = (seite.inhalt?.[block.key] || []).filter(g => g.titel || g.zeilen?.some(z2 => z2.name || z2.wert))
      const inhalt = { ...seite.inhalt, [block.key]: [...bisher, ...d.gruppen.map(g => ({ titel: g.titel, zeilen: g.zeilen.map(z2 => ({ name: z2.name, zusatz: z2.zusatz, wert: z2.wert })) }))] }
      if (!inhalt.name && d.name) inhalt.name = d.name
      angehaengt = await seitePatch(k, flags, pfad, slug, { inhalt })
    }
    if (alsJson) return json(angehaengt ? { ...d, seite: angehaengt.seite, wartet: !!angehaengt.wartet } : d)
    aus(T.erkannt(d.zeilen || 0, (d.gruppen || []).length))
    if (d.unsicher) aus(T.unsicher(d.unsicher))
    if (d.hinweis) aus(d.hinweis)
    for (const g of d.gruppen || []) {
      aus(`\n${g.titel || '–'}`)
      for (const z2 of g.zeilen) aus(`  ${z2.name}${z2.zusatz ? ` (${z2.zusatz})` : ''}${z2.wert ? `  ${z2.wert}` : ''}${z2.unsicher ? '  ?' : ''}`)
    }
    if (angehaengt) aus('\n' + T.angehaengt(flags.seite))
    if (d.offen !== null && d.offen !== undefined) aus(T.offen(d.offen))
    return
  }

  if (u === 'list' && ['labels', 'designs', 'projekte'].includes(b)) {
    const d = await rufe(mitSchluessel(), 'GET', `/${b}`)
    if (alsJson) return json(d)
    if (b === 'labels') return tabelle(d.labels, [['id', 'ID'], ['name', 'Name'], ['color', 'Farbe/Color']])
    if (b === 'projekte') return tabelle(d.projekte, [['id', 'ID'], ['name', 'Name']])
    for (const [gruppe, eintraege] of Object.entries(d)) { aus(`\n${gruppe}`); for (const e of eintraege) aus(`  ${e.id.padEnd(12)} ${e.name || ''}`) }
    return
  }

  throw new ApiFehler(0, { code: 'UNBEKANNT', message: T.unbekannt([b, u].filter(Boolean).join(' ') || '–') })
}

// --- Start ---------------------------------------------------------------------------
export async function main(argv = process.argv.slice(2), env = process.env) {
  const { pos, flags } = zerlege(argv)
  T = TEXTE[sprache(env, flags)]
  alsJson = !!flags.json
  if (flags.version || flags.v) { aus(VERSION); return 0 }
  if (flags.help || flags.h || !pos.length || pos[0] === 'help') { aus(T.hilfe); return 0 }
  try {
    await befehl(pos, flags, env)
    return 0
  } catch (e) {
    if (e instanceof KonfigFehler) e = new ApiFehler(0, { code: e.code, message: e.message })
    if (!(e instanceof ApiFehler)) throw e
    if (alsJson) process.stderr.write(JSON.stringify({ error: { status: e.status, code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } }) + '\n')
    else process.stderr.write(`${T.fehler}: ${sauber(e.message)}${e.code && e.status ? ` (${e.code}, HTTP ${e.status})` : ''}\n`)
    return e.status === 401 ? 3 : e.status === 403 ? 4 : e.status === 0 ? 2 : 1
  }
}

// Nur ausfuehren, wenn direkt aufgerufen (nicht beim Import in den Tests).
// Ueber realpath: npm legt fuer `sameqr` einen Verweis ohne .js an.
let direkt = false
try { direkt = !!process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url } catch {}
if (direkt) main().then(code => process.exit(code), e => { process.stderr.write(String(e?.stack || e) + '\n'); process.exit(1) })

export { konfigDatei }
