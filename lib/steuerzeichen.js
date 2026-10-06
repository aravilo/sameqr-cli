// Unsichtbare und steuernde Zeichen in Texten, die Dritte schreiben oder die
// spaeter in einem Terminal, einer CSV oder bei einem Sprachmodell landen
// (Audit 06.10.2026 MCP-8, R2-3, R3-11).
//
// EINE Regel fuer Server (Namen, Formular-Eingaenge, App-Namen) und CLI:
// packages/cli/lib/steuerzeichen.js ist eine Kopie dieser Datei, und
// scripts/pruefe-cli.mjs vergleicht beide Byte fuer Byte.
//
// Grundlage sind die Unicode-Klassen statt einer Liste von Bereichen, damit
// nichts durchrutscht, was niemand aufgezaehlt hat:
//   \p{Cc}  Steuerzeichen (C0, DEL, C1 — darunter ESC, CSI, OSC)
//   \p{Cf}  Formatzeichen (Bidi, Null-Breite, BOM, Tags U+E0000–E007F …)
// dazu Zeilen- und Absatztrenner (U+2028/2029, R4) und, was keine Klasse
// traegt, aber leer aussieht oder Zeichen veraendert:
// Hangul-Fueller, Braille-Leerzeichen U+2800, Mongolische und allgemeine
// Variantenwaehler.
//
// Ausnahmen:
//   - Tab und Zeilenumbruch in mehrzeiligen Feldern
//   - ZWNJ (U+200C): Persisch, Indische Schriften
//   - ZWJ (U+200D) nur zwischen zwei Emoji (👨‍🍳)
//   - VS16 (U+FE0F) nur direkt nach einem Emoji (❤️)
const STEUER = /[\p{Cc}\p{Cf}\u2028\u2029\u115F\u1160\u3164\uFFA0\u2800\u180B-\u180F\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/u
const EMOJI = /\p{Extended_Pictographic}/u

function bleibt(z, vor, nach, mehrzeilig) {
  if (z === '\t' || z === '\n' || z === '\r') return mehrzeilig
  if (z === '‌') return true
  if (z === '‍') return !!vor && (EMOJI.test(vor) || vor === '️') && !!nach && EMOJI.test(nach)
  if (z === '️') return !!vor && EMOJI.test(vor)
  return !STEUER.test(z)
}

// Ersetzt jedes betroffene Zeichen durch ersatz(zeichen). Gemeinsamer Kern fuer
// Entfernen (Server) und Maskieren (CLI).
export function ersetzeSteuerzeichen(text, ersatz, { mehrzeilig = false } = {}) {
  // Schneller Weg (Audit R6-1): Ohne ein einziges betroffenes Zeichen bleibt
  // der Text, wie er ist — die Ausnahmen unten betreffen nur solche Zeichen.
  if (!STEUER.test(String(text))) return String(text)
  const z = [...String(text)]
  let out = ''
  for (let i = 0; i < z.length; i++) out += bleibt(z[i], z[i - 1], z[i + 1], mehrzeilig) ? z[i] : ersatz(z[i])
  return out
}

// Entfernt die Zeichen. Einzeilig werden Tab und Zeilenumbruch zu einem
// Leerzeichen (statt Woerter zusammenzukleben).
export function ohneSteuerzeichen(text, { mehrzeilig = false } = {}) {
  let t = String(text)
  if (!mehrzeilig) t = t.replace(/[\t\n\r]+/g, ' ')
  return ersetzeSteuerzeichen(t, () => '', { mehrzeilig })
}

export function hatSteuerzeichen(text, { mehrzeilig = false } = {}) {
  const t = String(text)
  return ersetzeSteuerzeichen(t, () => '', { mehrzeilig }) !== t
}
