// Wechselkurs USD→EUR für Sammlungswert-Summen/-Sortierung, die über
// card_prints hinweg aggregieren — dort können jetzt gemischte Währungen
// vorkommen (Yu-Gi-Oh! ist USD, die anderen 4 Spiele EUR, siehe
// card_prints.currency). Ohne Umrechnung würde eine Summe USD- und EUR-Beträge
// einfach addieren, als wären sie gleich — falscher Sammlungswert.
const FRANKFURTER_URL = 'https://api.frankfurter.app/latest?from=USD&to=EUR';
// Grober Fallback, falls die Kursquelle nicht erreichbar ist — besser eine
// leicht ungenaue Umrechnung als USD/EUR gar nicht zu unterscheiden.
const FALLBACK_USD_TO_EUR = 0.92;
const CACHE_MS = 12 * 60 * 60 * 1000; // 12h — der Kurs ändert sich nicht stündlich relevant

let cached: { rate: number; fetchedAt: number } | null = null;

export async function getUsdToEurRate(): Promise<number> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.rate;
  try {
    const res = await fetch(FRANKFURTER_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: { EUR?: number } };
    const rate = data.rates?.EUR;
    if (!rate || rate <= 0) throw new Error('Kein gültiger Kurs in der Antwort');
    cached = { rate, fetchedAt: Date.now() };
    return rate;
  } catch {
    // Bei Fehlern den letzten bekannten (auch abgelaufenen) Cache-Wert
    // bevorzugen, sonst den Fallback — besser als der Anfrage komplett
    // fehlzuschlagen, nur weil die Kursquelle kurz down ist.
    return cached?.rate ?? FALLBACK_USD_TO_EUR;
  }
}
