// Yugipedia (yugipedia.com) als SEKUNDÄRQUELLE für Yu-Gi-Oh!-Lücken.
//
// YGOPRODeck bleibt die primäre Quelle für alles (Karten, Preise, deutsche
// Namen/Texte) — Yugipedia wird nur befragt, wenn YGOPRODeck etwas nicht
// liefert: (a) deutsche Name/Text-Übersetzung fehlt, (b) der set-spezifische
// deutsche Sammelnummern-Präfix ist unbekannt (YGOPRODeck liefert grundsätzlich
// keine deutschen Sammelnummern). Bereits vorhandene YGOPRODeck-Daten werden
// NIE überschrieben.
//
// Kein Cargo/SMW-Query-Endpunkt verfügbar (getestet, `action=cargoquery` wird
// nicht erkannt) — daher wird die rohe Wikitext-Seite geholt (`action=query`,
// `prop=revisions`) und die relevanten Infobox-Template-Felder per Regex
// herausgezogen. Fragiler als eine echte API, aber Yugipedia bietet nichts
// Robusteres öffentlich an. Bewusst best-effort (liefert bei jedem Fehler
// `null` statt zu werfen) und nur bei `--force`-Läufen aktiv (s. yugioh.ts) —
// sonst würde jeder tägliche Delta-Import erneut tausende Karten/Sets ohne
// deutsche Übersetzung gegen Yugipedia prüfen, die dort ebenfalls nie eine
// haben werden.
const API_BASE = 'https://yugipedia.com/api.php';
const USER_AGENT = 'tcg-collection-manager (fallback DE-Übersetzungen, best-effort)';

async function fetchWikitext(title: string): Promise<string | null> {
  const url = `${API_BASE}?${new URLSearchParams({
    action: 'query',
    prop: 'revisions',
    titles: title,
    rvprop: 'content',
    format: 'json',
    formatversion: '2',
  })}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      query?: { pages?: { missing?: boolean; revisions?: { content: string }[] }[] };
    };
    const page = body.query?.pages?.[0];
    if (!page || page.missing || !page.revisions?.length) return null;
    return page.revisions[0].content;
  } catch {
    return null;
  }
}

/**
 * Extrahiert ein einzelnes Infobox-Template-Feld wie "| de_name = …" (bis
 * Zeilenende). Zwischen "=" und dem Wert bewusst NUR horizontalen Whitespace
 * zulassen (`[ \t]*`, kein `\s*`) — sonst frisst `\s*` bei leeren Feldern
 * (z. B. mehrzeilige Listen wie "| de_prefix =\n* STAS-DE\n* STAX-DE") den
 * Zeilenumbruch mit und die Erfassung beginnt versehentlich in der nächsten
 * Zeile, im schlimmsten Fall mitten im nächsten Feld (z. B. "| it_name = ").
 * Ist das Feld auf seiner eigenen Zeile leer, gilt es als nicht vorhanden.
 * Zusätzliches Sicherheitsnetz: ein Wert, der selbst wie eine Wikitext-
 * Feldzeile aussieht (beginnt mit "|"), wird verworfen statt übernommen.
 */
function extractField(wikitext: string, field: string): string | null {
  const m = wikitext.match(new RegExp(`\\|\\s*${field}\\s*=[ \\t]*([^\\n]*)`));
  const value = m?.[1]?.trim();
  if (!value || value.startsWith('|')) return null;
  return value;
}

export interface YugipediaCardTranslation {
  name_de: string;
  card_text_de: string;
}

/**
 * Deutsche Name/Text-Übersetzung einer Karte, sofern Yugipedia eine hat.
 * Seitentitel = englischer Kartenname (Yugipedia benennt Kartenseiten so).
 * Sicherheitscheck: das `password`-Feld (YGOPRODecks numerische Karten-ID,
 * dort identisch geführt) muss zur erwarteten ID passen — verhindert eine
 * falsche Zuordnung bei Namenskollisionen/Weiterleitungen.
 */
export async function fetchYugipediaCardTranslation(
  englishName: string,
  expectedPasscode: string
): Promise<YugipediaCardTranslation | null> {
  const wikitext = await fetchWikitext(englishName);
  if (!wikitext) return null;

  const password = extractField(wikitext, 'password');
  if (!password || password !== expectedPasscode) return null;

  const name_de = extractField(wikitext, 'de_name');
  const card_text_de = extractField(wikitext, 'de_text') || extractField(wikitext, 'de_lore');
  if (!name_de || !card_text_de) return null;
  return { name_de, card_text_de };
}

/**
 * Set-spezifischer deutscher Sammelnummern-Präfix (z. B. "LOB-G" statt des
 * naiven "LOB-DE") aus der Set-Infobox. Seitentitel = englischer Set-Name.
 */
export async function fetchYugipediaSetDePrefix(englishSetName: string): Promise<string | null> {
  const wikitext = await fetchWikitext(englishSetName);
  if (!wikitext) return null;
  return extractField(wikitext, 'de_prefix');
}

/** Führt `fn` über `items` mit maximal `limit` gleichzeitigen Aufrufen aus. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
