// Umrechnung der in der DB gespeicherten lokalen Bildpfade in API-URLs.
//
// In der DB stehen zwei Arten von Bildreferenzen:
//   - image_url / image_small_url: die *Quell*-URLs der externen Anbieter.
//     Sie werden nur vom Download-Script (images:download) benutzt und dürfen
//     das Backend nie verlassen — Hotlinking ist z. B. bei YGOPRODeck untersagt.
//   - image_path / image_small_path: der Pfad der lokalen Kopie relativ zu
//     IMAGES_DIR (z. B. "yugioh/cards/123.jpg"), gesetzt vom Download-Script.
//
// Die API liefert ausschließlich /images/<image_path> aus (statische Route in
// app.ts). Fehlt die lokale Kopie, wird null geliefert — das Frontend zeigt
// dann seinen Platzhalter.

/** Relativen DB-Pfad in die öffentliche URL der statischen Bild-Route übersetzen. */
export function localImageUrl(imagePath: string | null | undefined): string | null {
  return imagePath ? `/images/${imagePath}` : null;
}

/**
 * Antwortzeile auf lokale Bild-URLs umstellen: ersetzt image_url/image_small_url
 * durch die URLs der lokalen Kopien und entfernt die internen Pfad-Spalten.
 * Erwartet, dass die Query image_path (und ggf. image_small_path) selektiert hat.
 */
export function withLocalImages<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  if ('image_path' in out) {
    out.image_url = localImageUrl(out.image_path as string | null);
    delete out.image_path;
  }
  if ('image_small_path' in out) {
    out.image_small_url = localImageUrl(out.image_small_path as string | null);
    delete out.image_small_path;
  }
  return out as T;
}
