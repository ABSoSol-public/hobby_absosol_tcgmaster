// Sprachumschaltung (Deutsch/Englisch) für UI-Texte und Kartendaten.
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'de' | 'en';

const STORAGE_KEY = 'tcg-lang';

const dict = {
  auth_login_title: { de: 'Anmelden', en: 'Sign in' },
  auth_username: { de: 'Benutzername', en: 'Username' },
  auth_password: { de: 'Passwort', en: 'Password' },
  auth_login_button: { de: 'Anmelden', en: 'Sign in' },
  auth_logging_in: { de: 'Melde an …', en: 'Signing in …' },
  auth_logout: { de: 'Abmelden', en: 'Sign out' },
  auth_role_viewer: { de: 'nur lesen', en: 'read only' },

  nav_dashboard: { de: 'Übersicht', en: 'Dashboard' },
  nav_cards: { de: 'Karten', en: 'Cards' },
  nav_sets: { de: 'Sets', en: 'Sets' },
  nav_collection: { de: 'Sammlung', en: 'Collection' },
  nav_decks: { de: 'Decks', en: 'Decks' },
  nav_glossary: { de: 'Glossar', en: 'Glossary' },

  glossary_heading: { de: 'Glossar', en: 'Glossary' },
  glossary_intro: {
    de: 'Community-Jargon und Schlüsselwörter je Spiel — bei Riftbound anhand der offiziellen Erinnerungstexte, bei den etablierten Spielen größtenteils informeller Community-Sprachgebrauch statt offizieller Herstellerbegriffe.',
    en: 'Community jargon and keywords per game — for Riftbound based on the official reminder text, for the established games mostly informal community usage rather than official publisher terms.',
  },
  glossary_search_placeholder: { de: 'Begriff suchen …', en: 'Search terms …' },
  glossary_empty: { de: 'Kein Begriff gefunden.', en: 'No term found.' },
  glossary_rarities_heading: { de: 'Seltenheit erkennen', en: 'How to recognize rarity' },
  glossary_rarities_intro: {
    de: 'Woran man die Seltenheitsstufe einer physischen Karte erkennt (Folie/Symbol/Rahmen), sortiert von häufig zu selten.',
    en: 'How to tell a physical card’s rarity tier apart (foil/symbol/frame), ordered from common to rare.',
  },
  glossary_terms_heading: { de: 'Community-Jargon', en: 'Community jargon' },

  decks_title: { de: 'Decks', en: 'Decks' },
  decks_empty: { de: 'Noch keine Decks. Lege eins an oder importiere eine YDK-Datei.', en: 'No decks yet. Create one or import a YDK file.' },
  deck_new_placeholder: { de: 'Name des neuen Decks …', en: 'New deck name …' },
  deck_create: { de: 'Anlegen', en: 'Create' },
  deck_import_ydk: { de: 'YDK importieren', en: 'Import YDK' },
  deck_export_ydk: { de: 'YDK exportieren', en: 'Export YDK' },
  deck_export_pdf: { de: 'Als PDF exportieren', en: 'Export as PDF' },
  deck_importing: { de: 'Importiere …', en: 'Importing …' },
  deck_import_unmatched: { de: 'nicht im Katalog gefunden', en: 'not found in catalog' },
  deck_cards_label: { de: 'Karten', en: 'cards' },
  deck_delete_confirm: { de: 'Deck wirklich löschen?', en: 'Really delete this deck?' },
  deck_back: { de: '← Zurück zur Deck-Liste', en: '← Back to deck list' },
  deck_rename: { de: 'Umbenennen', en: 'Rename' },
  deck_rename_prompt: { de: 'Neuer Deck-Name:', en: 'New deck name:' },
  deck_search_placeholder: { de: 'Karte suchen und hinzufügen …', en: 'Search cards to add …' },
  deck_search_hint: { de: 'Mindestens 2 Zeichen eingeben.', en: 'Type at least 2 characters.' },
  deck_no_results: { de: 'Keine Treffer.', en: 'No results.' },
  deck_add: { de: '+ Deck', en: '+ Deck' },
  deck_add_side: { de: '+ Side', en: '+ Side' },
  deck_zone_main: { de: 'Main Deck', en: 'Main Deck' },
  deck_zone_extra: { de: 'Extra Deck', en: 'Extra Deck' },
  deck_zone_side: { de: 'Side Deck', en: 'Side Deck' },
  deck_zone_empty: { de: 'leer', en: 'empty' },
  deck_gray_unowned: { de: 'Nicht besessene ausgrauen', en: 'Gray out unowned' },
  deck_warn_copies: { de: 'Zu viele Kopien', en: 'Too many copies' },
  deck_owned_coverage: { de: 'davon im Besitz', en: 'of them owned' },
  deck_stat_monsters: { de: 'Monster', en: 'Monsters' },
  deck_stat_spells: { de: 'Zauber', en: 'Spells' },
  deck_stat_traps: { de: 'Fallen', en: 'Traps' },

  dash_title: { de: 'Übersicht', en: 'Dashboard' },
  dash_stat_copies: { de: 'Karten in der Sammlung', en: 'Cards in collection' },
  dash_stat_distinct_cards: { de: 'Verschiedene Karten', en: 'Distinct cards' },
  dash_stat_distinct_prints: { de: 'Verschiedene Prints', en: 'Distinct prints' },
  dash_stat_market_value: { de: 'Marktwert (ca.)', en: 'Market value (approx.)' },
  dash_stat_purchase_value: { de: 'Kaufwert', en: 'Purchase value' },
  dash_stat_hypothetical_value: { de: 'Hypothetischer Wert (min. 1 € je Karte)', en: 'Hypothetical value (min. €1 per card)' },
  print_flavor_name_hint: { de: 'Aufdruck', en: 'Printed as' },
  dash_catalog_heading: { de: 'Kartenkatalog', en: 'Card catalog' },
  dash_catalog_summary: { de: 'Karten im Katalog.', en: 'cards in catalog.' },
  dash_catalog_browse: { de: 'Zum Karten-Browser →', en: 'Go to card browser →' },
  dash_catalog_empty: {
    de: 'Der Yu-Gi-Oh!-Katalog ist noch leer. Starte den Import, um alle Karten, Sets und Preise von YGOPRODeck zu laden (Dauer: einige Minuten).',
    en: 'The Yu-Gi-Oh! catalog is still empty. Start the import to load all cards, sets and prices from YGOPRODeck (takes a few minutes).',
  },
  dash_import_running: { de: 'Import läuft …', en: 'Import running …' },
  dash_import_start: { de: 'Katalog importieren / aktualisieren', en: 'Import / update catalog' },
  dash_import_last: { de: 'Letzter Import:', en: 'Last import:' },
  dash_games_heading: { de: 'Spiele', en: 'Games' },
  dash_games_game: { de: 'Spiel', en: 'Game' },
  dash_games_status: { de: 'Status', en: 'Status' },
  dash_games_catalog_count: { de: 'Karten im Katalog', en: 'Cards in catalog' },
  dash_games_collected: { de: 'In Sammlung', en: 'In collection' },
  dash_games_collected_unique: { de: 'Davon einzigartig', en: 'Unique owned' },
  dash_games_active: { de: 'aktiv', en: 'active' },
  dash_games_planned: { de: 'geplant', en: 'planned' },
  dash_games_import: { de: 'Importieren', en: 'Import' },
  dash_games_no_importer: { de: 'Quelle folgt', en: 'source pending' },
  dash_images_heading: { de: 'Kartenbilder', en: 'Card images' },
  dash_images_hint: {
    de: 'Lädt Bilder neuer oder geänderter Karten lokal herunter, damit sie nicht bei jedem Aufruf von externen Quellen kommen.',
    en: 'Downloads images for new or changed cards locally, so they don’t have to be fetched from external sources on every request.',
  },
  dash_images_start: { de: 'Bilder aktualisieren', en: 'Update images' },
  dash_images_running: { de: 'Bilder werden geladen …', en: 'Downloading images …' },
  dash_images_last: { de: 'Letzter Lauf:', en: 'Last run:' },

  cards_title: { de: 'Karten', en: 'Cards' },
  cards_search_placeholder: { de: 'Karte suchen (Name, Text, Nummer oder ID) …', en: 'Search cards (name, text, number or ID) …' },

  // Generische Filter-Labels (Schlüssel kommen aus der Backend-Konfiguration)
  filter_all: { de: 'alle', en: 'all' },
  filter_type: { de: 'Typ', en: 'Type' },
  filter_attribute: { de: 'Attribut', en: 'Attribute' },
  filter_race: { de: 'Typ/Rasse', en: 'Race' },
  filter_element: { de: 'Element', en: 'Element' },
  filter_rarity: { de: 'Seltenheit', en: 'Rarity' },
  filter_domain: { de: 'Domäne', en: 'Domain' },
  filter_color: { de: 'Farbe', en: 'Color' },
  filter_ink: { de: 'Tinte', en: 'Ink' },
  filter_cost: { de: 'Kosten', en: 'Cost' },
  cards_loading: { de: 'Lade Karten …', en: 'Loading cards …' },
  cards_empty: { de: 'Keine Karten gefunden.', en: 'No cards found.' },
  cards_empty_hint: { de: 'Ist der Katalog schon importiert? (Übersicht → Katalog importieren)', en: 'Has the catalog been imported yet? (Dashboard → import catalog)' },

  card_back_to_browser: { de: '← Zurück zum Karten-Browser', en: '← Back to card browser' },
  card_back_to: { de: '← Zurück zu', en: '← Back to' },
  card_prev: { de: '‹ Vorherige', en: '‹ Previous' },
  card_next: { de: 'Nächste ›', en: 'Next ›' },
  card_of: { de: 'von', en: 'of' },
  owned_overlay: { de: 'Im Besitz', en: 'Owned' },
  owned_cards: { de: 'Karten', en: 'cards' },
  owned_copies: { de: 'Exemplare', en: 'copies' },
  card_prop_type: { de: 'Typ', en: 'Type' },
  card_prop_attribute: { de: 'Attribut', en: 'Attribute' },
  card_prop_race: { de: 'Typ/Rasse', en: 'Race' },
  card_prop_level: { de: 'Level/Rang', en: 'Level/Rank' },
  card_prop_linkval: { de: 'Link-Rating', en: 'Link rating' },
  card_prop_scale: { de: 'Pendel-Skala', en: 'Pendulum scale' },
  card_prop_atk: { de: 'ATK', en: 'ATK' },
  card_prop_def: { de: 'DEF', en: 'DEF' },
  card_prop_archetype: { de: 'Archetyp', en: 'Archetype' },
  card_prop_passcode: { de: 'Passcode', en: 'Passcode' },
  card_prints_heading: { de: 'Prints', en: 'Prints' },
  card_no_translation: { de: 'Keine deutsche Übersetzung verfügbar', en: 'No English name/text on file' },

  price_history_toggle: { de: 'Verlauf', en: 'History' },
  price_history_toggle_close: { de: 'Verlauf ausblenden', en: 'Hide history' },
  price_history_loading: { de: 'Lade Preisverlauf …', en: 'Loading price history …' },
  price_history_empty: { de: 'Noch keine Preis-Historie für diesen Print.', en: 'No price history for this print yet.' },
  price_history_single_point: {
    de: 'Bisher nur ein Preis-Snapshot — die Kurve wächst mit dem täglichen Import.',
    en: 'Only one price snapshot so far — the chart grows with the daily import.',
  },
  price_history_source_manual: { de: 'eigene Eingabe', en: 'manual entry' },
  price_history_add_heading: { de: 'Eigenen Preis erfassen', en: 'Add your own price' },
  price_history_add_price: { de: 'Preis', en: 'Price' },
  price_history_add_currency: { de: 'Währung', en: 'Currency' },
  price_history_add_date: { de: 'Datum', en: 'Date' },
  price_history_add_button: { de: 'Hinzufügen', en: 'Add' },
  price_history_add_saving: { de: 'Speichere …', en: 'Saving …' },
  price_history_manual_heading: { de: 'Eigene Einträge', en: 'Your entries' },
  price_history_manual_delete: { de: 'Löschen', en: 'Delete' },
  price_history_manual_delete_confirm: { de: 'Diesen Preis-Eintrag wirklich löschen?', en: 'Really delete this price entry?' },

  col_set: { de: 'Set', en: 'Set' },
  col_number: { de: 'Nummer', en: 'Number' },
  card_number_de_hint: { de: 'dt. vermutlich', en: 'DE presumably' },
  col_rarity: { de: 'Seltenheit', en: 'Rarity' },
  col_price: { de: 'Preis', en: 'Price' },
  price_marketplace_link: { de: 'Bei Cardmarket ansehen', en: 'View on Cardmarket' },
  col_owned: { de: 'Besitz', en: 'Owned' },
  col_card: { de: 'Karte', en: 'Card' },
  col_condition: { de: 'Zustand', en: 'Condition' },
  col_language: { de: 'Sprache', en: 'Language' },
  col_quantity: { de: 'Menge', en: 'Quantity' },
  col_purchase_price: { de: 'Kaufpreis', en: 'Purchase price' },
  col_market_value: { de: 'Marktwert', en: 'Market value' },

  add_to_collection: { de: '+ Sammlung', en: '+ Collection' },
  remove_from_collection: { de: '− Sammlung', en: '− Collection' },
  quick_add_one: { de: '+1', en: '+1' },
  quick_remove_one: { de: '−1', en: '−1' },
  remove_modal_title: { de: 'Aus der Sammlung entfernen', en: 'Remove from collection' },
  remove_one: { de: '−1', en: '−1' },
  remove_entry: { de: 'Eintrag löschen', en: 'Delete entry' },
  remove_loading: { de: 'Lade Einträge …', en: 'Loading entries …' },
  remove_empty: { de: 'Keine Sammlungseinträge zu diesem Print.', en: 'No collection entries for this print.' },
  remove_close: { de: 'Schließen', en: 'Close' },

  sets_title: { de: 'Sets', en: 'Sets' },
  sets_search_placeholder: { de: 'Set suchen …', en: 'Search sets …' },
  sets_loading: { de: 'Lade Sets …', en: 'Loading sets …' },
  sets_empty: { de: 'Keine Sets gefunden.', en: 'No sets found.' },
  sets_date_unknown: { de: 'Datum unbekannt', en: 'Date unknown' },
  sets_prints: { de: 'Prints', en: 'prints' },
  sets_collected: { de: 'gesammelt', en: 'collected' },
  sets_owned_value: { de: 'Wert:', en: 'value:' },
  sets_owned_value_hypothetical: { de: 'hypothetisch', en: 'hypothetical' },
  sets_filter_all: { de: 'Alle Sets', en: 'All sets' },
  sets_filter_owned: { de: 'Sets mit Karten', en: 'Sets with cards' },
  sets_filter_missing: { de: 'Sets ohne Karten', en: 'Sets without cards' },

  set_back_to_list: { de: '← Zurück zur Set-Liste', en: '← Back to set list' },
  set_released_on: { de: 'Erschienen am', en: 'Released on' },
  set_release_unknown: { de: 'Erscheinungsdatum unbekannt', en: 'Release date unknown' },
  set_only_missing: { de: 'Nur fehlende Karten', en: 'Only missing cards' },

  coll_title: { de: 'Meine Sammlung', en: 'My collection' },
  coll_search_placeholder: { de: 'In der Sammlung suchen …', en: 'Search collection …' },
  coll_sort_newest: { de: 'Zuletzt hinzugefügt', en: 'Recently added' },
  coll_sort_oldest: { de: 'Zuerst hinzugefügt', en: 'Oldest added' },
  coll_sort_name: { de: 'Name (A–Z)', en: 'Name (A–Z)' },
  coll_sort_quantity: { de: 'Menge (meiste zuerst)', en: 'Quantity (most first)' },
  coll_sort_value: { de: 'Wert (höchster zuerst)', en: 'Value (highest first)' },
  coll_filter_all_games: { de: 'Alle Spiele', en: 'All games' },
  coll_filter_all_sets: { de: 'Alle Sets', en: 'All sets' },
  coll_filter_all_conditions: { de: 'Alle Zustände', en: 'All conditions' },
  coll_filter_all_languages: { de: 'Alle Sprachen', en: 'All languages' },
  coll_filter_first_edition: { de: 'Nur 1. Auflage', en: '1st edition only' },
  coll_loading: { de: 'Lade Sammlung …', en: 'Loading collection …' },
  coll_empty: { de: 'Noch nichts gesammelt. Öffne eine Karte oder ein Set und klicke „+ Sammlung“.', en: 'Nothing collected yet. Open a card or set and click "+ Collection".' },
  coll_confirm_delete: { de: 'wirklich löschen?', en: 'really delete?' },
  coll_edit: { de: 'Bearbeiten', en: 'Edit' },
  coll_delete: { de: 'Löschen', en: 'Delete' },
  coll_edit_title: { de: 'Eintrag bearbeiten', en: 'Edit entry' },
  coll_storage: { de: 'Lagerort', en: 'Storage location' },
  coll_notes: { de: 'Notizen', en: 'Notes' },
  csv_export: { de: 'CSV exportieren', en: 'Export CSV' },
  csv_import: { de: 'CSV importieren', en: 'Import CSV' },
  csv_importing: { de: 'Importiere …', en: 'Importing …' },
  csv_result: { de: 'CSV-Import:', en: 'CSV import:' },
  csv_result_created: { de: 'neu angelegt', en: 'created' },
  csv_result_updated: { de: 'aktualisiert', en: 'updated' },
  csv_result_failed: { de: 'fehlgeschlagen', en: 'failed' },

  scan_button: { de: '📷 Scannen', en: '📷 Scan' },
  scan_title: { de: 'Karte scannen', en: 'Scan card' },
  scan_hint: {
    de: 'Fotografiere die ganze Ecke mit Set-Code/Sammelnummer (z. B. „LOB-EN119" oder „119/198") scharf und gut ausgeleuchtet, ohne Spiegelungen — den genauen Ausschnitt für die Erkennung markierst du im nächsten Schritt.',
    en: 'Photograph the whole corner with the set code/collector number (e.g. "LOB-EN119" or "119/198") in sharp focus, well lit, without glare — you\'ll mark the exact area for recognition in the next step.',
  },
  scan_take_photo: { de: 'Foto aufnehmen', en: 'Take photo' },
  scan_use_webcam: { de: 'Webcam verwenden', en: 'Use webcam' },
  scan_capture: { de: 'Aufnehmen', en: 'Capture' },
  scan_focus: { de: '🔍 Fokussieren', en: '🔍 Focus' },
  scan_focusing: { de: 'Fokussiere …', en: 'Focusing …' },
  scan_crop_hint: {
    de: 'Ziehe ein Rechteck eng um Set-Code/Sammelnummer — je enger und schärfer der Ausschnitt, desto besser die Erkennung.',
    en: 'Drag a rectangle tightly around the set code/collector number — the tighter and sharper the crop, the better the recognition.',
  },
  scan_crop_confirm: { de: 'Text erkennen', en: 'Recognize text' },
  scan_crop_reset: { de: 'Ausschnitt zurücksetzen', en: 'Reset selection' },
  scan_adjust_crop: { de: 'Ausschnitt anpassen', en: 'Adjust selection' },
  scan_recognizing: { de: 'Erkenne Text …', en: 'Recognizing text …' },
  scan_no_match: { de: 'Keine passende Karte gefunden.', en: 'No matching card found.' },
  scan_pick_result: { de: 'Mehrere Treffer — welche Karte ist es?', en: 'Multiple matches — which card is it?' },
  scan_retry: { de: 'Neues Foto', en: 'New photo' },
  scan_manual_open: { de: 'Set-Code/Nummer manuell eingeben', en: 'Enter set code/number manually' },
  scan_manual_close: { de: 'Manuelle Eingabe schließen', en: 'Close manual entry' },
  scan_manual_placeholder: { de: 'z. B. LOB-EN119 oder 119/198', en: 'e.g. LOB-EN119 or 119/198' },
  scan_manual_search: { de: 'Suchen', en: 'Search' },
  scan_manual_searching: { de: 'Suche …', en: 'Searching …' },

  modal_add_title: { de: 'Zur Sammlung hinzufügen', en: 'Add to collection' },
  modal_quantity: { de: 'Menge', en: 'Quantity' },
  modal_condition: { de: 'Zustand', en: 'Condition' },
  modal_language: { de: 'Sprache', en: 'Language' },
  modal_purchase_price: { de: 'Kaufpreis (€)', en: 'Purchase price (€)' },
  modal_acquired_at: { de: 'Erworben am', en: 'Acquired on' },
  modal_storage: { de: 'Lagerort', en: 'Storage location' },
  modal_first_edition: { de: '1. Auflage', en: '1st edition' },
  modal_notes: { de: 'Notizen', en: 'Notes' },
  modal_cancel: { de: 'Abbrechen', en: 'Cancel' },
  modal_save: { de: 'Speichern', en: 'Save' },
  modal_saving: { de: 'Speichere …', en: 'Saving …' },
  modal_add: { de: 'Hinzufügen', en: 'Add' },

  paginator_back: { de: '‹ Zurück', en: '‹ Back' },
  paginator_page: { de: 'Seite', en: 'Page' },
  paginator_of: { de: 'von', en: 'of' },
  paginator_entries: { de: 'Einträge', en: 'entries' },
  paginator_next: { de: 'Weiter ›', en: 'Next ›' },
};

export type TKey = keyof typeof dict;

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TKey) => string;
  /** Wie t, aber für dynamische Schlüssel (z. B. Filter aus dem Backend) mit Fallback auf den Schlüssel selbst. */
  tf: (key: string) => string;
  locale: string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'en' ? 'en' : 'de';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang: setLangState,
      t: (key) => dict[key]?.[lang] ?? key,
      tf: (key) => (dict as Record<string, Record<Lang, string>>)[key]?.[lang] ?? key,
      locale: lang === 'de' ? 'de-DE' : 'en-US',
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage muss innerhalb von LanguageProvider verwendet werden');
  return ctx;
}

/** Kartenname in der gewünschten Sprache; fällt zurück, wenn keine Übersetzung vorhanden ist. */
export function cardName(card: { name: string; name_de?: string | null }, lang: Lang): string {
  return lang === 'de' ? card.name_de || card.name : card.name;
}

/** Kartentext in der gewünschten Sprache; fällt zurück, wenn keine Übersetzung vorhanden ist. */
export function cardText(card: { card_text?: string | null; card_text_de?: string | null }, lang: Lang): string {
  return (lang === 'de' ? card.card_text_de || card.card_text : card.card_text) || '';
}
