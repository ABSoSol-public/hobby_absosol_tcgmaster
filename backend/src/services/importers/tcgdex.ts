// TCGdex (tcgdex.dev) als SEKUNDÄRQUELLE für deutsche Pokémon-Übersetzungen.
//
// pokemontcg.io bleibt die primäre Quelle für alles (Karten, Sets, Preise) —
// es liefert grundsätzlich nur Englisch, keine anderen Sprachen. TCGdex wird
// nur befragt, wenn eine Karte noch keine deutsche Übersetzung hat. Bereits
// vorhandene Übersetzungen werden NIE überschrieben (s. pokemon.ts).
//
// Kartenmatching: TCGdex nutzt für "reguläre" TCG-Karten dasselbe ID-Schema
// wie pokemontcg.io (`{Set-Code}-{Nummer}`, z. B. "base1-4") — live verifiziert
// (Charizard = "base1-4" in beiden Quellen identisch). Direktes Mapping über
// unsere bestehende `cards.external_id`, kein Fuzzy-Matching nötig (anders als
// bei Yugipedia für Yu-Gi-Oh!).
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

export interface TcgdexCardTranslation {
  name: string;
  text: string | null;
}

interface TcgdexCardDetail {
  name: string;
  effect?: string; // Trainer-/Energie-Kartentext
  abilities?: { name: string; effect?: string }[];
  attacks?: { name: string; damage?: number | string; effect?: string }[];
}

/**
 * Deutsche Name/Text-Übersetzung einer einzelnen Karte. `id` muss exakt der
 * pokemontcg.io-ID entsprechen (= unser `cards.external_id`).
 */
export async function fetchTcgdexCardTranslation(id: string): Promise<TcgdexCardTranslation | null> {
  const c = await fetchJsonBestEffort<TcgdexCardDetail>(`${API_BASE}/cards/${encodeURIComponent(id)}`);
  if (!c?.name) return null;

  const textParts = [
    ...(c.abilities || []).map((a) => `${a.name}${a.effect ? `: ${a.effect}` : ''}`),
    ...(c.attacks || []).map((a) => `${a.name}${a.damage ? ` (${a.damage})` : ''}${a.effect ? `: ${a.effect}` : ''}`),
    c.effect || '',
  ].filter(Boolean);

  return { name: c.name, text: textParts.join('\n') || null };
}
