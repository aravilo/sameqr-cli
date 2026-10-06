// Hilfe und Meldungen auf Deutsch und Englisch. Die Sprache kommt aus
// --lang, SAMEQR_LANG oder LANG/LC_ALL (de* -> Deutsch, sonst Englisch).
export function sprache(env = process.env, flags = {}) {
  const roh = String(flags.lang || env.SAMEQR_LANG || env.LC_ALL || env.LC_MESSAGES || env.LANG || '').toLowerCase()
  return roh.startsWith('de') ? 'de' : 'en'
}

export const TEXTE = {
  de: {
    hilfe: `sameqr – Same-QR von der Kommandozeile

Aufruf: sameqr <befehl> [optionen]

Anmelden
  login                       API-Schlüssel verdeckt eingeben und prüfen
  login --stdin               Schlüssel von der Standardeingabe lesen
  logout                      gespeicherten Schlüssel löschen
  whoami                      Konto, Tarif und Grenzen

QR-Codes
  qr list                     alle Codes
  qr get <id>                 ein Code
  qr create --name <n> --url <https://…> [--slug <kurzlink>] [--label <id>]…
  qr update <id> [--url <https://…>] [--name <n>] [--label <id>]…
  qr delete <id>              löschen (fragt nach; ohne Terminal nur mit --yes)
  qr stats <id>               Scans und Zieländerungen

Gehostete Seiten (Speisekarte, Preisliste, Öffnungszeiten …)
  seite list
  seite create --vorlage <speisekarte|preisliste|zeiten|links|aktion|weingut|etikett|kontakt> --name <n>
  seite get <pfad/slug>
  seite update <pfad/slug> --datei <änderung.json>   (Felder: inhalt, betreiber, sprache, stil)
  seite publish <pfad/slug> [--offline]
  seite anfragen <pfad/slug>  Formular-Eingänge lesen

Karte einlesen (KI, zählt gegen dein Kontingent)
  karte import <foto|pdf>… [--vorlage speisekarte] [--seite <pfad/slug>]
                              mit --seite: erkannte Gruppen an die Seite anhängen

Weiteres
  labels list | designs list | projekte list
  mcp                         MCP-Einrichtung für Claude Code, Cursor, Codex anzeigen

Optionen
  --json                      Ausgabe als JSON (für Skripte und Agenten)
  --api <url>                 andere Adresse (Standard https://sameqr.com); ein gespeicherter
                              Schlüssel geht nur an die Adresse, bei der du dich angemeldet hast
  --allow-foreign-api         Schlüssel auch an eine andere Adresse als sameqr.com senden
  --yes                       Ziel ändern/offline/löschen ohne Rückfrage – nur ohne Terminal
  --lang de|en                Sprache der Ausgabe
  -h, --help | -v, --version

Umgebung: SAMEQR_API_KEY (Vorrang vor der gespeicherten Datei), SAMEQR_API_URL
Schlüssel anlegen: https://sameqr.com/dashboard → Konto → Zugang für CLI, Skripte und Agenten
Der Schlüssel wird nie als Argument übergeben – er stünde sonst in der Shell-Historie.`,
    schluesselFrage: 'API-Schlüssel (Eingabe bleibt unsichtbar): ',
    schluesselFormat: 'Das sieht nicht wie ein Same-QR-Schlüssel aus (sqr_live_…).',
    gespeichert: (uid, datei) => `Angemeldet als ${uid}. Schlüssel gespeichert in ${datei} (nur für dich lesbar).`,
    envAktiv: 'SAMEQR_API_KEY ist gesetzt und wird verwendet – es wird nichts gespeichert.',
    abgemeldet: datei => `Schlüssel gelöscht (${datei}).`,
    keinSchluessel: 'Nicht angemeldet. Erst `sameqr login` oder SAMEQR_API_KEY setzen.',
    unbekannt: b => `Unbekannter Befehl: ${b}. Hilfe: sameqr --help`,
    fehlt: w => `Es fehlt: ${w}`,
    bestaetigen: 'Das ändert gedruckte Codes bzw. Seiten. Ohne Terminal nur mit --yes.',
    abgebrochen: 'Abgebrochen, nichts geändert.',
    zielFrage: (id, ziel) => `Ziel von ${id} wirklich auf ${ziel} ändern? Gedruckte Codes führen danach dorthin.`,
    loeschFrage: id => `${id} wirklich löschen? Gedruckte Codes funktionieren danach nicht mehr.`,
    offlineFrage: s => `Seite ${s} wirklich offline nehmen?`,
    seiteZielFrage: s => `Die Änderung biegt Links der veröffentlichten Seite ${s} um oder leert sie. Wirklich?`,
    geloescht: 'Gelöscht.',
    leer: 'Nichts vorhanden.',
    fehler: 'Fehler',
    erkannt: (z, g) => `${z} Zeilen in ${g} Gruppen erkannt.`,
    unsicher: n => `${n} Zeilen sind unsicher – bitte durchsehen.`,
    angehaengt: s => `An die Seite ${s} angehängt (Entwurf bzw. neue Fassung – bitte durchsehen).`,
    offen: n => `Einlesen übrig in diesem Zeitraum: ${n}`,
    wartet: 'Die Seite liegt zur Prüfung bei uns; sie geht nach der Freigabe online.',
    veroeffentlicht: url => `Online: ${url}`,
    offline: 'Offline genommen.',
    dateiFehlt: d => `Datei nicht lesbar: ${d}`,
    mcp: (api) => `MCP-Server: ${api}/api/mcp

Claude Code:
  claude mcp add --transport http sameqr ${api}/api/mcp --header "Authorization: Bearer $SAMEQR_API_KEY"

Cursor (~/.cursor/mcp.json):
  { "mcpServers": { "sameqr": { "url": "${api}/api/mcp", "headers": { "Authorization": "Bearer \${env:SAMEQR_API_KEY}" } } } }

Codex (~/.codex/config.toml):
  [mcp_servers.sameqr]
  url = "${api}/api/mcp"
  bearer_token_env_var = "SAMEQR_API_KEY"

ChatGPT und Claude.ai: als Connector "${api}/api/mcp" hinzufügen – die Anmeldung läuft über OAuth im Browser.`,
  },
  en: {
    hilfe: `sameqr – Same-QR from the command line

Usage: sameqr <command> [options]

Sign in
  login                       enter your API key (hidden) and verify it
  login --stdin               read the key from standard input
  logout                      delete the stored key
  whoami                      account, plan and limits

QR codes
  qr list                     all codes
  qr get <id>                 one code
  qr create --name <n> --url <https://…> [--slug <short-link>] [--label <id>]…
  qr update <id> [--url <https://…>] [--name <n>] [--label <id>]…
  qr delete <id>              delete (asks first; without a terminal only with --yes)
  qr stats <id>               scans and target changes

Hosted pages (menu, price list, opening hours …)
  seite list
  seite create --vorlage <speisekarte|preisliste|zeiten|links|aktion|weingut|etikett|kontakt> --name <n>
  seite get <path/slug>
  seite update <path/slug> --datei <change.json>     (fields: inhalt, betreiber, sprache, stil)
  seite publish <path/slug> [--offline]
  seite anfragen <path/slug>  read form submissions

Import a menu (AI, counts against your quota)
  karte import <photo|pdf>… [--vorlage speisekarte] [--seite <path/slug>]
                              with --seite: append the recognized groups to that page

More
  labels list | designs list | projekte list
  mcp                         show MCP setup for Claude Code, Cursor, Codex

Options
  --json                      JSON output (for scripts and agents)
  --api <url>                 other address (default https://sameqr.com); a stored key is only
                              sent to the address you signed in with
  --allow-foreign-api         also send the key to an address other than sameqr.com
  --yes                       change target/offline/delete without asking – only without a terminal
  --lang de|en                output language
  -h, --help | -v, --version

Environment: SAMEQR_API_KEY (wins over the stored file), SAMEQR_API_URL
Create a key: https://sameqr.com/dashboard → Account → Access for CLI, scripts and agents
The key is never passed as an argument – it would end up in your shell history.`,
    schluesselFrage: 'API key (input stays hidden): ',
    schluesselFormat: 'That does not look like a Same-QR key (sqr_live_…).',
    gespeichert: (uid, datei) => `Signed in as ${uid}. Key stored in ${datei} (readable only by you).`,
    envAktiv: 'SAMEQR_API_KEY is set and used – nothing is stored.',
    abgemeldet: datei => `Key deleted (${datei}).`,
    keinSchluessel: 'Not signed in. Run `sameqr login` or set SAMEQR_API_KEY.',
    unbekannt: b => `Unknown command: ${b}. Help: sameqr --help`,
    fehlt: w => `Missing: ${w}`,
    bestaetigen: 'This changes printed codes or pages. Without a terminal only with --yes.',
    abgebrochen: 'Cancelled, nothing changed.',
    zielFrage: (id, ziel) => `Really change the target of ${id} to ${ziel}? Printed codes will lead there.`,
    loeschFrage: id => `Really delete ${id}? Printed codes will stop working.`,
    offlineFrage: s => `Really take page ${s} offline?`,
    seiteZielFrage: s => `This change redirects links of the published page ${s} or empties it. Really?`,
    geloescht: 'Deleted.',
    leer: 'Nothing here.',
    fehler: 'Error',
    erkannt: (z, g) => `Recognized ${z} lines in ${g} groups.`,
    unsicher: n => `${n} lines are uncertain – please review.`,
    angehaengt: s => `Appended to page ${s} (draft or new version – please review).`,
    offen: n => `Imports left in this period: ${n}`,
    wartet: 'The page is waiting for our review; it goes online once approved.',
    veroeffentlicht: url => `Online: ${url}`,
    offline: 'Taken offline.',
    dateiFehlt: d => `Cannot read file: ${d}`,
    mcp: (api) => `MCP server: ${api}/api/mcp

Claude Code:
  claude mcp add --transport http sameqr ${api}/api/mcp --header "Authorization: Bearer $SAMEQR_API_KEY"

Cursor (~/.cursor/mcp.json):
  { "mcpServers": { "sameqr": { "url": "${api}/api/mcp", "headers": { "Authorization": "Bearer \${env:SAMEQR_API_KEY}" } } } }

Codex (~/.codex/config.toml):
  [mcp_servers.sameqr]
  url = "${api}/api/mcp"
  bearer_token_env_var = "SAMEQR_API_KEY"

ChatGPT and Claude.ai: add "${api}/api/mcp" as a connector – sign-in runs via OAuth in the browser.`,
  },
}
