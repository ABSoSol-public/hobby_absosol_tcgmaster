// YGOPRODeck (und andere Quellen) liefern Sammelnummern nur mit dem
// englischen Sprachkürzel (z. B. "MP24-EN174"), auch wenn eine deutsche
// TCG-Ausgabe der Karte existiert und auf ihr ein eigener deutscher Code
// aufgedruckt ist. Diese deutsche Nummer ist in der Quelle schlicht nicht
// enthalten — daher hier nur eine Ableitung, keine verifizierte Angabe.
// Verwendet auf Karten-, Set- und Sammlungsseite, damit der Hinweis überall
// auftaucht, wo eine Sammelnummer angezeigt wird.
//
// `dePrefix` (optional): set-spezifischer echter deutscher Präfix, best-effort
// aus Yugipedia ermittelt (`card_sets.de_prefix`, s. backend/services/importers/
// yugipedia.ts) — nötig, weil ein naives "EN"→"DE"-Ersetzen bei frühen Sets
// falsch ist (Legend of Blue Eyes White Dragon: real "LOB-G001", nicht
// "LOB-DE001"). Ist kein Präfix bekannt, bleibt die bisherige Ratelogik als
// Fallback (moderne Sets nutzen tatsächlich durchgehend "-DE").
export function deVariantHint(
  collectorNumber: string | null | undefined,
  hasGermanRelease: boolean,
  dePrefix?: string | null
): string | null {
  if (!collectorNumber || !hasGermanRelease) return null;
  const m = collectorNumber.match(/^([A-Z0-9]{2,6})-([A-Z]{1,3})(\d{1,4}[A-Z]?)$/i);
  if (!m) return null;
  const [, setCode, lang, number] = m;
  if (lang.toUpperCase() === 'DE') return null;
  const prefix = dePrefix || `${setCode}-DE`;
  return `${prefix}${number}`;
}
