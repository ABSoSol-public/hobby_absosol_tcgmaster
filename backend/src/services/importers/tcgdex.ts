// TCGdex (tcgdex.dev) als SEKUNDÄRQUELLE für deutsche Pokémon-Übersetzungen.
//
// pokemontcg.io bleibt die primäre Quelle für alles (Karten, Sets, Preise) —
// es liefert grundsätzlich nur Englisch, keine anderen Sprachen. TCGdex wird
// nur befragt, wenn eine Karte noch keine deutsche Übersetzung hat. Bereits
// vorhandene Übersetzungen werden NIE überschrieben (s. pokemon.ts).
//
// Kartenmatching: TCGdex nutzt für die meisten Sets dasselbe ID-Schema wie
// pokemontcg.io (`{Set-Code}-{Nummer}`, z. B. "base1-4", live verifiziert:
// Charizard = "base1-4" in beiden Quellen identisch) — ABER seit der
// "sv"-Ära (Scarlet & Violet, seit 2023) mit Nullen aufgefüllt: aus unserem
// "sv1-16" wird bei TCGdex "sv01-016" (Set-Nummer auf 2, Sammelnummer auf
// 3 Stellen gepolstert), live verifiziert. Frühere Ären (swsh/xy/sm/bw/ex/
// base) matchen weiterhin direkt 1:1. `resolveTcgdexId()` probiert bei
// keinem direkten Treffer plausible gepolsterte Varianten gegen den bereits
// geladenen ID-Index durch, statt für jede Nichtübereinstimmung blind einen
// Detail-Request zu riskieren.
const API_BASE = 'https://api.tcgdex.net/v2/de';
const USER_AGENT = 'tcg-collection-manager (fallback DE-Übersetzungen, best-effort)';

async function fetchJsonBestEffort<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Bulk-Index aller deutschen Karten-IDs bei TCGdex (ein einzelner Request,
 * ~1,8 MB) — dient nur dazu, vorab zu wissen, für welche unserer Karten
 * überhaupt ein Versuch lohnt, statt für jede fehlende Übersetzung blind
 * einen Detail-Request zu riskieren, der dann doch "nicht gefunden" liefert.
 */
export async function fetchTcgdexGermanIds(): Promise<Set<string>> {
  const rows = await fetchJsonBestEffort<{ id: string }[]>(`${API_BASE}/cards`);
  return new Set((rows || []).map((r) => r.id));
}

const ID_PATTERN = /^([a-z]+)(\d+)((?:\.\d+)?[a-z]*)-(\d+)([a-z]*)$/i;

/** Mit Nullen gepolsterte ID-Varianten (Set-Code + Sammelnummer), s. Kommentar oben. */
function paddedIdCandidates(externalId: string): string[] {
  const m = externalId.match(ID_PATTERN);
  if (!m) return [];
  const [, prefix, setNum, setSuffix, cardNum, cardSuffix] = m;
  const setVariants = new Set([`${prefix}${setNum}${setSuffix}`, `${prefix}${setNum.padStart(2, '0')}${setSuffix}`]);
  const numberVariants = new Set([cardNum, cardNum.padStart(2, '0'), cardNum.padStart(3, '0'), cardNum.padStart(4, '0')]);
  const out: string[] = [];
  for (const sc of setVariants) {
    for (const nv of numberVariants) out.push(`${sc}-${nv}${cardSuffix}`);
  }
  return out;
}

/**
 * Löst unsere `external_id` (pokemontcg.io-Format) zur tatsächlichen
 * TCGdex-ID auf — meistens identisch, bei der gepolsterten "sv"-Ära über
 * `paddedIdCandidates()`. `null`, wenn TCGdex die Karte nachweislich nicht
 * kennt (kein Request nötig, da gegen den bereits geladenen `deIds`-Index
 * geprüft wird).
 */
export function resolveTcgdexId(externalId: string, deIds: Set<string>): string | null {
  if (deIds.has(externalId)) return externalId;
  for (const candidate of paddedIdCandidates(externalId)) {
    if (deIds.has(candidate)) return candidate;
  }
  return null;
}

export interface TcgdexCardTranslation {
  name: string;
  text: string | null;
  /** Nationale Pokédex-Nummer, sofern vorhanden (nur bei Pokémon-Karten, nicht bei Trainer/Energie). */
  pokedexId: number | null;
}

interface TcgdexCardDetail {
  name: string;
  effect?: string; // Trainer-/Energie-Kartentext
  abilities?: { name: string; effect?: string }[];
  attacks?: { name: string; damage?: number | string; effect?: string }[];
  dexId?: number[];
}

/**
 * Deutsche Name/Text-Übersetzung einer einzelnen Karte. `id` muss exakt der
 * pokemontcg.io-ID entsprechen (= unser `cards.external_id`). Liefert bei
 * Pokémon-Karten nebenbei die nationale Pokédex-Nummer (`dexId`) mit — dieselbe
 * Quelle, kein zusätzlicher Request.
 */
export async function fetchTcgdexCardTranslation(id: string): Promise<TcgdexCardTranslation | null> {
  const c = await fetchJsonBestEffort<TcgdexCardDetail>(`${API_BASE}/cards/${encodeURIComponent(id)}`);
  if (!c?.name) return null;

  const textParts = [
    ...(c.abilities || []).map((a) => `${a.name}${a.effect ? `: ${a.effect}` : ''}`),
    ...(c.attacks || []).map((a) => `${a.name}${a.damage ? ` (${a.damage})` : ''}${a.effect ? `: ${a.effect}` : ''}`),
    c.effect || '',
  ].filter(Boolean);

  return { name: c.name, text: textParts.join('\n') || null, pokedexId: c.dexId?.[0] ?? null };
}
