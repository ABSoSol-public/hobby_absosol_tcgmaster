// Gemeinsames Interface aller Katalog-Importer.
// Ein neues Spiel (Pokémon, Magic, …) implementiert dieses Interface
// und wird in services/importers/index.ts registriert — sonst ist nichts nötig.

export interface ImportStats {
  sets: number;
  /** Anzahl von der Quelle gelieferter Karten (nicht zwingend alle geschrieben). */
  cards: number;
  /** Anzahl von der Quelle gelieferter Prints (nicht zwingend alle geschrieben). */
  prints: number;
  /** Tatsächlich neu geschriebene/aktualisierte Karten (Delta). */
  cardsChanged: number;
  /** Tatsächlich neu geschriebene/aktualisierte Prints (Delta). */
  printsChanged: number;
  /** true, wenn der Import komplett übersprungen wurde, weil die Quelle unverändert war. */
  skipped: boolean;
}

export interface ImportOptions {
  /** Ignoriert den Versions-Check und lädt/vergleicht alles neu. */
  force?: boolean;
}

export interface GameImporter {
  /** Muss einem games.code entsprechen (z. B. "yugioh"). */
  gameCode: string;
  /**
   * Führt einen Delta-Import aus: prüft zuerst, ob sich die Quelle seit dem
   * letzten Lauf überhaupt geändert hat, und schreibt danach nur Datensätze,
   * deren Inhalt sich tatsächlich geändert hat. Mit `force: true` wird der
   * Versions-Check übersprungen und jeder Datensatz neu verglichen.
   */
  run(onProgress?: (message: string) => void, options?: ImportOptions): Promise<ImportStats>;
}
