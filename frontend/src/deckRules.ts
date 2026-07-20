// Deck-Regeln je Spiel: Zonen mit Größenlimits, Kopienlimit und
// automatische Zonen-Zuordnung (Yu-Gi-Oh!: Fusion/Synchro/Xyz/Link → Extra Deck).
// Die Regeln dienen der Anzeige/Validierung im Builder — gespeichert wird immer.
import { DeckZone, GameData } from './types';

export interface ZoneRule {
  zone: DeckZone;
  min: number;
  max: number;
}

export interface DeckRules {
  zones: ZoneRule[];
  /** Maximale Kopien einer Karte über Main + Side zusammen. */
  maxCopies: number;
  /** Zone, in die eine Karte beim schnellen Hinzufügen gehört. */
  zoneFor: (card: { card_type?: string | null; game_data?: GameData | null }) => DeckZone;
}

const EXTRA_FRAME = /^(fusion|synchro|xyz|link)/;

const RULES: Record<string, DeckRules> = {
  yugioh: {
    zones: [
      { zone: 'main', min: 40, max: 60 },
      { zone: 'extra', min: 0, max: 15 },
      { zone: 'side', min: 0, max: 15 },
    ],
    maxCopies: 3,
    zoneFor: (card) => {
      const frame = String(card.game_data?.frameType || '');
      if (EXTRA_FRAME.test(frame)) return 'extra';
      // Fallback, falls frameType fehlt: am Kartentyp erkennen
      if (/fusion|synchro|xyz|link/i.test(card.card_type || '')) return 'extra';
      return 'main';
    },
  },
  magic: {
    zones: [
      { zone: 'main', min: 60, max: 999 },
      { zone: 'side', min: 0, max: 15 },
    ],
    maxCopies: 4, // Ausnahme Standardländer wird bewusst nicht geprüft
    zoneFor: () => 'main',
  },
  pokemon: {
    zones: [{ zone: 'main', min: 60, max: 60 }],
    maxCopies: 4, // Ausnahme Basis-Energien wird bewusst nicht geprüft
    zoneFor: () => 'main',
  },
  lorcana: {
    zones: [{ zone: 'main', min: 60, max: 999 }],
    maxCopies: 4,
    zoneFor: () => 'main',
  },
  riftbound: {
    // Legende/Champion/Runen-/Schlachtfeld-Zonen werden bewusst nicht separat geprüft
    zones: [{ zone: 'main', min: 40, max: 999 }],
    maxCopies: 3,
    zoneFor: () => 'main',
  },
};

const DEFAULT_RULES: DeckRules = {
  zones: [
    { zone: 'main', min: 0, max: 999 },
    { zone: 'side', min: 0, max: 999 },
  ],
  maxCopies: 4,
  zoneFor: () => 'main',
};

export function deckRulesFor(gameCode: string): DeckRules {
  return RULES[gameCode] || DEFAULT_RULES;
}

/** Banlist-Kopiengrenze je TCG-Status; Karten ohne Eintrag unterliegen nur dem normalen Kopienlimit. */
const BANLIST_LIMIT: Record<string, number> = {
  Forbidden: 0,
  Limited: 1,
  'Semi-Limited': 2,
};

/**
 * Maximal erlaubte Kopien einer Karte inkl. Banlist (aktuell nur für Yu-Gi-Oh! gepflegt,
 * `game_data.banTcg` kommt aus dem YGOPRODeck-Import). Andere Spiele liefern einfach das
 * normale Kopienlimit zurück, da für sie keine Banlist erfasst wird.
 */
export function legalCopiesFor(gameCode: string, card: { game_data?: GameData | null }, rules: DeckRules): number {
  const banTcg = gameCode === 'yugioh' ? card.game_data?.banTcg : null;
  if (banTcg && banTcg in BANLIST_LIMIT) return BANLIST_LIMIT[banTcg];
  return rules.maxCopies;
}
