// Statisches Glossar für Community-Jargon/Schlüsselwörter je Spiel — reine
// Referenz, unabhängig von der DB (ändert sich nicht mit Importen). Riftbound-
// Erklärungen sind anhand der tatsächlichen Erinnerungstexte auf riftcodex.com
// gegengeprüft; bei den etablierten Spielen (Yu-Gi-Oh!/Magic/Pokémon/Lorcana)
// handelt es sich größtenteils um informellen Community-Jargon, nicht um
// offizielle Regelbegriffe der Hersteller.
export interface GlossaryTerm {
  term: string;
  de: string;
  en: string;
}

/** Eine Seltenheitsstufe: Name + wie man sie am physischen Karton erkennt (Folie/Symbol/Rahmen). */
export interface GlossaryRarity {
  name: string;
  de: string;
  en: string;
}

export interface GlossaryGame {
  code: string;
  label: string;
  terms: GlossaryTerm[];
  rarities: GlossaryRarity[];
}

export const GLOSSARY: GlossaryGame[] = [
  {
    code: 'yugioh',
    label: 'Yu-Gi-Oh!',
    terms: [
      {
        term: 'Omni Negate',
        de: 'Ein Monster, das mehrere unterschiedliche Arten von Effekten/Beschwörungen negieren kann (z. B. Monstereffekt, Zauber, Falle), statt nur eine feste Art — kein offizieller Konami-Begriff, sondern Community-Jargon.',
        en: "A monster that can negate several different kinds of effects/summons (e.g. monster effect, spell, trap) instead of only one fixed type — a community term, not an official Konami term.",
      },
      {
        term: 'Hand Trap',
        de: 'Eine Karte (meist ein Monster), die direkt von der Hand ohne Beschwörung aktiviert werden kann, um den gegnerischen Zug zu unterbrechen.',
        en: "A card (usually a monster) that can be activated straight from the hand, without being summoned, to disrupt the opponent's turn.",
      },
      {
        term: 'Board Wipe',
        de: 'Ein Effekt, der auf einen Schlag mehrere gegnerische (oder alle) Karten vom Feld entfernt bzw. zerstört.',
        en: 'An effect that removes/destroys several (or all) of the opponent’s cards from the field in one shot.',
      },
      {
        term: 'Brick / gebrickt',
        de: 'Eine Starthand, die nicht funktioniert bzw. keine sinnvolle Aktion zulässt — Pech beim Ziehen.',
        en: "An opening hand that doesn't function or allows no meaningful play — bad luck on the draw.",
      },
      {
        term: 'Starter / Extender',
        de: 'Starter: eine Karte, mit der eine Combo überhaupt erst beginnt. Extender: eine Karte, die eine bereits laufende Combo mit weiteren Ressourcen fortsetzt.',
        en: 'Starter: a card a combo begins with. Extender: a card that continues an already-running combo with further resources.',
      },
      {
        term: 'Floodgate',
        de: 'Eine Karte, die eine bestimmte Spielmechanik (z. B. Spezialbeschwörungen) für beide Seiten einschränkt oder verbietet, um den Gegner auszubremsen.',
        en: 'A card that restricts or shuts down a specific game mechanic (e.g. special summons) for both players, to slow the opponent down.',
      },
      {
        term: 'Going First / Going Second',
        de: 'Ob man den ersten oder zweiten Zug des Duells hat — bei modernen Combo-Decks meist ein enormer Vorteil, weshalb der Würfel-/Münzwurf oft hart umkämpft ist.',
        en: 'Whether you take the first or second turn of the duel — usually a major advantage for modern combo decks, which is why the coin/die roll is often hotly contested.',
      },
      {
        term: 'Quick Effect',
        de: 'Ein Effekt, der wie eine Falle jederzeit (auch im gegnerischen Zug) aktiviert werden kann — erkennbar am Blitz-Symbol bzw. am Text "kann im Zug beider Spieler aktiviert werden".',
        en: "An effect that, like a trap, can be activated at any time (including the opponent's turn) — marked with the quick-effect symbol or the text 'can be activated during either player's turn'.",
      },
      {
        term: 'OTK / FTK',
        de: 'One Turn Kill / First Turn Kill — ein Deckkonzept, das versucht, die kompletten gegnerischen Lebenspunkte in einem einzigen (bei FTK: dem allerersten) Zug zu vernichten.',
        en: "One Turn Kill / First Turn Kill — a deck concept aiming to wipe out the opponent's entire life points in a single turn (for FTK: the very first turn).",
      },
      {
        term: 'Non-Engine',
        de: 'Eine Karte, die nicht zum eigentlichen Combo-"Motor" des Decks gehört, sondern separat Interaktion/Absicherung bietet (z. B. Hand Traps, Floodgates).',
        en: "A card that isn't part of the deck's actual combo 'engine', but instead provides separate interaction/insurance (e.g. hand traps, floodgates).",
      },
      {
        term: 'Grind Game',
        de: 'Eine längere Partie ohne schnellen Abschluss, in der beide Seiten um Kartenvorteil/Ressourcen ringen, statt in einem Zug zu gewinnen.',
        en: 'A longer game without a quick finish, where both sides fight over card advantage/resources instead of winning in one turn.',
      },
    ],
    rarities: [
      {
        name: 'Common',
        de: 'Kein Folien-/Glanzeffekt — Kartenname in normaler schwarzer Schrift, mattes Artwork.',
        en: 'No foil/holo treatment — card name in plain black text, matte artwork.',
      },
      {
        name: 'Rare',
        de: 'Kartenname in silberner Foliendruckschrift; Artwork und Textbox bleiben matt/unglänzend.',
        en: 'Card name printed in silver foil; artwork and text box stay matte/non-holographic.',
      },
      {
        name: 'Super Rare',
        de: 'Das Artwork ist holografisch/glänzend, der Kartenname bleibt aber in normaler schwarzer Schrift (kein Folienname).',
        en: 'The artwork itself is holographic/foil, but the card name stays in plain black text (no foil name).',
      },
      {
        name: 'Ultra Rare',
        de: 'Wie Super Rare (holografisches Artwork), zusätzlich aber der Kartenname in Gold-Folie.',
        en: 'Like Super Rare (holographic artwork), but additionally the card name is printed in gold foil.',
      },
      {
        name: 'Secret Rare',
        de: 'Kartenname in silbern schillernder Regenbogen-Folie, oft kombiniert mit einem eigenen, abweichenden Holo-Muster im Artwork.',
        en: 'Card name in shimmering silver rainbow foil, often combined with its own distinct holo pattern in the artwork.',
      },
      {
        name: 'Ultimate Rare',
        de: 'Artwork und Rahmen sind geprägt/erhaben (3D-Relief) — beim Darüberstreichen mit dem Finger spürbar, nicht nur optisch.',
        en: 'Artwork and card frame are embossed/raised (3D relief) — noticeably textured to the touch, not just visually.',
      },
      {
        name: 'Ghost Rare',
        de: 'Mattsilbrige, „geisterhafte" Folienoptik über der ganzen Karte, mit eigener, abweichender Schriftart für den Kartennamen.',
        en: 'A matte-silver, "ghostly" foil finish across the whole card, with its own distinct font for the card name.',
      },
      {
        name: 'Starlight Rare',
        de: 'Durchgehend schillernde Regenbogenfolie über die komplette Kartenoberfläche inkl. Rahmen und Textbox, nicht nur Name/Artwork.',
        en: 'Shimmering rainbow foil across the entire card surface, including the frame and text box — not just the name/artwork.',
      },
      {
        name: "Collector's Rare",
        de: 'Goldstichige, strukturierte Musterung im Kartenhintergrund/Rahmen statt eines klassischen Regenbogenfolien-Looks.',
        en: 'A gold-flecked, textured pattern in the card background/frame instead of a classic rainbow-foil look.',
      },
    ],
  },
  {
    code: 'magic',
    label: 'Magic: The Gathering',
    terms: [
      {
        term: 'Bomb',
        de: 'Eine einzelne, extrem starke Karte, die ein Spiel praktisch allein entscheiden kann, wenn sie nicht schnell beantwortet wird.',
        en: 'A single, extremely powerful card that can win the game almost by itself if not answered quickly.',
      },
      {
        term: 'Removal',
        de: 'Sammelbegriff für Karten, die gegnerische Kreaturen (oder andere Permanents) entfernen, zerstören oder exilieren.',
        en: 'Umbrella term for cards that remove, destroy or exile opposing creatures (or other permanents).',
      },
      {
        term: 'Tempo',
        de: 'Der relative Zeit-/Entwicklungsvorsprung im Spiel — Tempo zu gewinnen bedeutet, den Gegner zu ineffizienten Reaktionen zu zwingen, statt selbst zu entwickeln.',
        en: 'The relative time/development lead in the game — gaining tempo means forcing the opponent into inefficient reactions instead of developing their own board.',
      },
      {
        term: 'Card Advantage',
        de: 'Wenn man für den Einsatz einer eigenen Karte mehr als eine gegnerische Karte "eintauscht" bzw. schlicht mehr Karten zur Verfügung hat als der Gegner.',
        en: 'When using one card "trades" for more than one opposing card, or you simply have more cards available than your opponent.',
      },
      {
        term: 'Mana Curve',
        de: 'Die Verteilung der Manakosten aller Kartenim Deck über die verschiedenen Kostenstufen — eine gute Kurve sorgt in jeder Phase für sinnvolle Spielzüge.',
        en: "The distribution of a deck's mana costs across the different cost brackets — a good curve gives meaningful plays in every phase of the game.",
      },
      {
        term: 'Ramp',
        de: 'Karten/Strategien, die schneller als normal zusätzliches Mana erzeugen, um teure Karten früher zu spielen.',
        en: 'Cards/strategies that generate extra mana faster than normal, to play expensive cards earlier.',
      },
      {
        term: 'Tutor',
        de: 'Ein Effekt, der eine bestimmte Karte gezielt aus dem Deck sucht, statt sie zufällig zu ziehen.',
        en: 'An effect that searches the deck for a specific card, instead of drawing it randomly.',
      },
      {
        term: 'ETB (Enters-the-Battlefield)',
        de: 'Ein Effekt, der genau in dem Moment ausgelöst wird, in dem eine Karte ins Spiel kommt.',
        en: 'An effect that triggers the exact moment a card enters the battlefield.',
      },
      {
        term: 'Board Wipe',
        de: 'Ein Zauber, der (fast) alle Kreaturen/Permanents gleichzeitig vom Spielfeld entfernt.',
        en: 'A spell that removes (almost) all creatures/permanents from the battlefield at once.',
      },
      {
        term: 'Stax',
        de: 'Eine Strategie, die den Gegner durch viele einschränkende Effekte (Steuern, Sperren) am Agieren hindert, statt selbst schnell zu gewinnen.',
        en: 'A strategy that hinders the opponent through many restrictive effects (taxes, locks) rather than winning quickly itself.',
      },
      {
        term: 'Aggro / Midrange / Control',
        de: 'Die drei klassischen Deck-Archetypen: Aggro will möglichst schnell gewinnen, Control setzt auf Entfernung/Kartenvorteil bis ins späte Spiel, Midrange liegt strategisch dazwischen.',
        en: 'The three classic deck archetypes: Aggro wants to win as fast as possible, Control relies on removal/card advantage into the late game, Midrange sits strategically in between.',
      },
      {
        term: 'Mana Screw / Mana Flood',
        de: 'Zu wenig (Screw) bzw. zu viel (Flood) Land im Verhältnis zu den Zaubersprüchen auf der Hand — beides bremst den eigenen Spielplan aus.',
        en: 'Too little (screw) or too much (flood) land relative to the spells in hand — both stall your own game plan.',
      },
    ],
    rarities: [
      {
        name: 'Common',
        de: 'Das kleine Symbol rechts neben dem Set-Namen in der Textbox ist schwarz oder weiß (Standardländer haben oft gar kein Symbol, zählen aber als Common).',
        en: 'The small symbol next to the set name in the text box is black or white (basic lands often have no symbol at all, but still count as common).',
      },
      {
        name: 'Uncommon',
        de: 'Dasselbe Symbol ist silbern eingefärbt.',
        en: 'The same symbol is colored silver.',
      },
      {
        name: 'Rare',
        de: 'Dasselbe Symbol ist golden eingefärbt.',
        en: 'The same symbol is colored gold.',
      },
      {
        name: 'Mythic Rare',
        de: 'Dasselbe Symbol ist orange-bronzefarben eingefärbt — die seltenste reguläre Stufe.',
        en: 'The same symbol is colored orange/bronze — the rarest regular tier.',
      },
      {
        name: 'Special (lila Symbol)',
        de: 'Ein violettes Symbol markiert historische Sonderfälle wie die „Timeshifted"-Karten aus Time Spiral — seltener eingestuft als reguläre Rares desselben Sets.',
        en: 'A purple symbol marks historical special cases like the "Timeshifted" cards from Time Spiral — ranked rarer than regular rares of the same set.',
      },
    ],
  },
  {
    code: 'pokemon',
    label: 'Pokémon TCG',
    terms: [
      {
        term: 'Prize Trade',
        de: 'Das Verhältnis, wie viele Preiskarten man pro gegnerischem K. o. selbst zieht bzw. wie viele der Gegner für einen eigenen K. o. zieht — oft wichtiger als die reine Kartenzahl.',
        en: 'The ratio of how many prize cards you take per opposing knockout (and vice versa) — often more important than raw card count.',
      },
      {
        term: 'Gust-Effekt (Gust Effect)',
        de: 'Ein Effekt, der ein beliebiges gegnerisches Pokémon von der Bank aktiv setzt, um es sofort angreifen zu können, statt nur das aktive Pokémon zu treffen.',
        en: "An effect that forces any of the opponent's benched Pokémon into the active spot, so it can be attacked immediately instead of only hitting the active Pokémon.",
      },
      {
        term: 'Setup(-Zug)',
        de: 'Die frühen Züge, in denen ein Deck seine Energie-/Entwicklungslinien aufbaut, bevor es richtig angreifen kann.',
        en: 'The early turn(s) in which a deck builds up its energy/evolution lines before it can start attacking properly.',
      },
      {
        term: 'Wall',
        de: 'Ein Pokémon mit sehr viel HP bzw. Schadensreduktion, das primär dazu dient, Angriffe auszuhalten, statt selbst K. o.s zu erzielen.',
        en: 'A Pokémon with very high HP or damage reduction, used primarily to soak up attacks rather than score knockouts itself.',
      },
      {
        term: 'Sniping',
        de: 'Gezieltes Verteilen von Schaden auf Pokémon auf der Bank statt nur auf das aktive Pokémon, um gezielt schwache Ziele zu erledigen.',
        en: 'Deliberately spreading damage onto benched Pokémon instead of only the active one, to pick off weak targets.',
      },
      {
        term: 'Attacher',
        de: 'Ein Pokémon oder Trainer, dessen Aufgabe es ist, (Spezial-)Energiekarten schneller ins Spiel zu bringen, als die normale Regel (eine Energie pro Zug) erlauben würde.',
        en: "A Pokémon or Trainer card whose job is to get (special) Energy into play faster than the normal one-per-turn rule would allow.",
      },
      {
        term: 'Toolbox(-Deck)',
        de: 'Ein Deck mit vielen unterschiedlichen, situativ austauschbaren Karten (oft über Suchen/Ablegen), statt einer festen Kernstrategie.',
        en: 'A deck built around many different, situationally interchangeable cards (often via search/discard effects) instead of a single fixed core strategy.',
      },
      {
        term: 'Stadium',
        de: 'Eine Arenakarte mit einem feldweiten, dauerhaften Effekt, bis eine andere Arena gespielt wird — betrifft meist beide Seiten gleichermaßen.',
        en: 'A Stadium card has a field-wide, ongoing effect that stays until another Stadium is played — usually affects both players equally.',
      },
      {
        term: 'Bench',
        de: 'Die nicht-aktiven Plätze für eigene Pokémon, die normalerweise nicht direkt angegriffen werden können.',
        en: 'The non-active slots for your own Pokémon, which normally cannot be attacked directly.',
      },
      {
        term: 'Special Energy',
        de: 'Energiekarten mit einem Zusatzeffekt statt reiner Basisenergie, oft mit eigenen Einschränkungen verbunden.',
        en: 'Energy cards with an added effect instead of plain basic Energy, usually paired with their own restrictions.',
      },
      {
        term: 'Knockout (K. o.) / OHKO',
        de: 'Ein Pokémon wird besiegt, sobald der Schaden seine verbleibenden HP erreicht; OHKO = "One-Hit-K. o.", also Besiegen mit einem einzigen Angriff.',
        en: "A Pokémon is defeated once damage reaches its remaining HP; OHKO = 'one-hit knockout', defeating it with a single attack.",
      },
      {
        term: 'Draw Support',
        de: 'Trainer-/Unterstützer-Karten, deren Haupteffekt darin besteht, zusätzliche Karten zu ziehen bzw. die Hand aufzufüllen.',
        en: "Trainer/Supporter cards whose main effect is drawing extra cards or refilling your hand.",
      },
    ],
    rarities: [
      {
        name: 'Common',
        de: 'Ein ausgefüllter schwarzer Kreis unten links neben der Kartennummer (bei ganz neuen Sets weiß statt schwarz).',
        en: 'A filled black circle at the bottom left next to the card number (white instead of black on the very newest sets).',
      },
      {
        name: 'Uncommon',
        de: 'Eine ausgefüllte Raute (Diamant) an derselben Stelle.',
        en: 'A filled diamond shape in the same spot.',
      },
      {
        name: 'Rare',
        de: 'Ein einzelner Stern an derselben Stelle.',
        en: 'A single star in the same spot.',
      },
      {
        name: 'Double Rare',
        de: 'Zwei schwarze Sterne.',
        en: 'Two black stars.',
      },
      {
        name: 'Ultra Rare',
        de: 'Zwei silberne Sterne — meist ein „Full Art"-Trainer/Pokémon ex ohne klassischen Kartenrahmen.',
        en: 'Two silver stars — usually a "full art" Trainer/Pokémon ex without the classic card frame.',
      },
      {
        name: 'Special Illustration Rare',
        de: 'Zwei goldene Sterne, kombiniert mit einem alternativen, meist ganzseitigen Artwork abseits des Standard-Motivs.',
        en: 'Two gold stars, combined with an alternate, usually full-bleed artwork different from the standard illustration.',
      },
      {
        name: 'Hyper Rare / Rainbow Rare',
        de: 'Ein goldenes „A"-ähnliches Symbol bzw. ein durchgehend regenbogenfarbener Kartenhintergrund über den kompletten Rahmen.',
        en: 'A gold "A"-like symbol, or a full rainbow-colored card background covering the entire frame.',
      },
    ],
  },
  {
    code: 'lorcana',
    label: 'Disney Lorcana',
    terms: [
      {
        term: 'Ink / Inkable',
        de: 'Ink ist die Ressource, mit der Karten bezahlt werden ("Inkwell"); nur als "inkable" markierte Karten dürfen dafür verdeckt ins Inkwell gelegt werden.',
        en: "Ink is the resource used to pay for cards (the 'Inkwell'); only cards marked 'inkable' may be placed face-down into the Inkwell for this.",
      },
      {
        term: 'Questing',
        de: 'Ein Charakter wird geschickt, um Lore-Punkte zu sammeln (das Sieg-Kriterium) — er kann dann in diesem Zug nicht mehr blocken/angreifen.',
        en: "A character is sent to quest for Lore (the win condition) — it then can't block/challenge for the rest of that turn.",
      },
      {
        term: 'Lore',
        de: 'Die Siegpunkte des Spiels — wer als Erster 20 Lore gesammelt hat, gewinnt.',
        en: 'The victory points of the game — the first player to accumulate 20 Lore wins.',
      },
      {
        term: 'Challenger +N',
        de: 'Der Charakter erhält beim Angreifen (Challenge) +N zusätzliche Stärke.',
        en: 'The character gets +N additional Strength while challenging (attacking).',
      },
      {
        term: 'Ward',
        de: 'Der Charakter kann nicht direkt als Ziel gegnerischer Karteneffekte gewählt werden (Kampfangriffe sind davon ausgenommen).',
        en: "The character can't be chosen as the target of opposing card effects directly (combat challenges are exempt).",
      },
      {
        term: 'Evasive',
        de: 'Der Charakter kann nur von anderen Charakteren mit Evasive angegriffen werden.',
        en: 'The character can only be challenged by other characters with Evasive.',
      },
      {
        term: 'Rush',
        de: 'Der Charakter darf schon in dem Zug, in dem er ins Spiel kommt, angreifen (überspringt die normale Wartezeit).',
        en: 'The character may challenge the same turn it enters play, skipping the normal summoning-sickness wait.',
      },
      {
        term: 'Bodyguard',
        de: 'Der Charakter darf auch geschöpft (exerted) als Ziel für gegnerische Angriffe gewählt werden, um andere eigene Charaktere zu schützen.',
        en: 'The character may be chosen as a challenge target even while exerted, shielding your other characters.',
      },
      {
        term: 'Support',
        de: 'Wird der Charakter zum Questen geschickt, darf seine Stärke stattdessen einem anderen Charakter für diesen Zug gutgeschrieben werden.',
        en: "When the character quests, its Strength may instead be added to another character's for that turn.",
      },
      {
        term: 'Resist +N',
        de: 'Schaden, den der Charakter durch Kampf oder Effekte erhalten würde, wird um N reduziert.',
        en: 'Damage the character would take from combat or effects is reduced by N.',
      },
      {
        term: 'Shift N',
        de: 'Für N Tinte darf die Karte direkt auf einen namensgleichen Charakter gelegt werden statt normal gespielt zu werden — sie kommt so ohne Wartezeit ins Spiel.',
        en: "For N ink, the card may be played directly on top of a character sharing its name instead of normally — it enters play without the summoning-sickness wait.",
      },
      {
        term: 'Singer N',
        de: 'Der Charakter darf einen Song mit Kosten bis N spielen, als wäre er selbst die Bezahlung dafür (statt Ink dafür auszugeben).',
        en: 'The character may sing (play) a Song card costing up to N as if it were paying with its own body instead of spending ink.',
      },
      {
        term: 'Reckless',
        de: 'Der Charakter darf nicht questen und muss angreifen, wenn er dazu in der Lage ist und ein gültiges Ziel existiert.',
        en: "The character can't quest, and must challenge if able and a legal target exists.",
      },
    ],
    rarities: [
      {
        name: 'Common',
        de: 'Graues, kreisförmiges Symbol unten im Kartenbild.',
        en: 'Grey, circular symbol at the bottom of the card art.',
      },
      {
        name: 'Uncommon',
        de: 'Weißes, buchförmiges Symbol an derselben Stelle.',
        en: 'White, book-shaped symbol in the same spot.',
      },
      {
        name: 'Rare',
        de: 'Bronzefarbenes, dreieckiges Symbol.',
        en: 'Bronze, triangular symbol.',
      },
      {
        name: 'Super Rare',
        de: 'Silberfarbenes, rautenförmiges Symbol.',
        en: 'Silver, diamond-shaped symbol.',
      },
      {
        name: 'Legendary',
        de: 'Goldfarbenes, fünfeckiges Symbol.',
        en: 'Gold, pentagon-shaped symbol.',
      },
      {
        name: 'Enchanted',
        de: 'Kein normales Rahmen-Layout mehr: durchgehend schillernd-holografisches Vollbild-Artwork ohne sichtbaren Tintenkosten-Kreis, dazu ein sechseckiges Symbol — die seltenste Stufe (ca. 1 von 100 Boostern).',
        en: 'No longer the normal frame layout: a fully shimmering, holographic full-art card with no visible ink-cost pip, plus a six-sided symbol — the rarest tier (roughly 1 in 100 packs).',
      },
    ],
  },
  {
    code: 'riftbound',
    label: 'Riftbound',
    terms: [
      {
        term: 'Legend',
        de: 'Die eine Karte, die dein Deck von Anfang an führt (vergleichbar mit einem Commander/Helden) — bestimmt oft die Domänen und die Strategie des Decks.',
        en: 'The single card that leads your deck from the start (similar to a Commander/hero) — often defines the deck’s domains and strategy.',
      },
      {
        term: 'Champion',
        de: 'Ein besonders starker, einzigartiger Unit-Subtyp, meist mit eigenständigen, mächtigen Fähigkeiten.',
        en: 'A particularly powerful, unique unit subtype, usually with distinctive, strong abilities.',
      },
      {
        term: 'Battlefield',
        de: 'Eine der Orte-Karten, auf denen gekämpft wird — man erobert (conquer) oder hält (hold) sie, um Punkte zu erzielen.',
        en: 'One of the location cards where combat happens — you conquer or hold them to score points.',
      },
      {
        term: 'Domain',
        de: 'Das Ressourcen-/Farbsystem des Spiels (Body, Calm, Chaos, Fury, Mind, Order, Colorless) — bestimmt, welche Runen/Karten ins Deck passen.',
        en: 'The game’s resource/color system (Body, Calm, Chaos, Fury, Mind, Order, Colorless) — determines which runes/cards fit into a deck.',
      },
      {
        term: 'Conquer / Hold',
        de: 'Conquer: ein Battlefield durch mehr zugewiesenen Kampfschaden als der Gegner für sich gewinnen. Hold: ein bereits erobertes Battlefield am Ende des Zugs weiterhin kontrollieren.',
        en: 'Conquer: win a battlefield by assigning more combat damage there than the opponent. Hold: still control an already-conquered battlefield at the end of the turn.',
      },
      {
        term: 'Showdown',
        de: 'Die Kampfphase an einem Battlefield, in der Einheiten sich gegenseitig Schaden zuteilen.',
        en: 'The combat phase at a battlefield, where units assign damage against each other.',
      },
      {
        term: 'Might / Energy / Power',
        de: 'Might = Kampfstärke einer Einheit; Energy und Power = die beiden Ressourcenwerte auf Karten, mit denen Kosten bezahlt werden.',
        en: 'Might = a unit’s combat strength; Energy and Power = the two resource values on cards used to pay costs.',
      },
      {
        term: 'XP',
        de: 'Erfahrungspunkte, die durch bestimmte Effekte gesammelt und später als Zusatzkosten ausgegeben werden können.',
        en: 'Experience points that get accumulated via certain effects and can later be spent as additional costs.',
      },
      {
        term: '[Deathknell]',
        de: 'Ein Effekt, der auslöst, sobald die Karte stirbt bzw. das Feld verlässt.',
        en: 'An effect that triggers the moment the card dies/leaves the field.',
      },
      {
        term: '[Temporary]',
        de: 'Die Karte (meist ein Token) wird zu Beginn der Beginning Phase ihres Besitzers automatisch entfernt, noch bevor gewertet wird.',
        en: 'The card (usually a token) is automatically removed at the start of its controller’s Beginning Phase, before scoring.',
      },
      {
        term: '[Hidden]',
        de: 'Die Karte wird verdeckt gespielt und kann später gegen zusätzliche Ressourcen als Reaction aufgedeckt werden.',
        en: 'The card is played face-down and can later be flipped up as a Reaction by paying an additional resource.',
      },
      {
        term: '[Reaction]',
        de: 'Ein Effekt bzw. eine Karte, die jederzeit gespielt werden darf, sogar bevor andere Zauber/Fähigkeiten aufgelöst werden.',
        en: 'An effect/card that may be played at any time, even before other spells/abilities resolve.',
      },
      {
        term: '[Ambush]',
        de: 'Die Karte darf als Reaction auf ein Battlefield gespielt werden, an dem man bereits eigene Einheiten hat.',
        en: 'The card may be played as a Reaction onto a battlefield where you already have units.',
      },
      {
        term: '[Legion]',
        de: 'Ein Effekt, der nur eintritt, wenn in diesem Zug bereits eine andere Karte gespielt wurde.',
        en: 'An effect that only triggers if another card has already been played this turn.',
      },
      {
        term: '[Mighty]',
        de: 'Zustand einer Einheit mit 5 oder mehr Might, der eigene Zusatzeffekte auslösen kann.',
        en: 'The state of a unit having 5 or more Might, which can trigger its own additional effects.',
      },
    ],
    rarities: [
      {
        name: 'Common',
        de: 'Einfacher bronzefarbener Kartenrahmen mit rundem Raritäts-Symbol (Gem) unten mittig, kein Folienglanz.',
        en: 'Simple bronze card frame with a round rarity gem at the bottom center, no foil finish.',
      },
      {
        name: 'Uncommon',
        de: 'Silberfarbener Kartenrahmen mit dreieckigem Raritäts-Symbol.',
        en: 'Silver card frame with a triangular rarity gem.',
      },
      {
        name: 'Rare',
        de: 'Goldener Vollbild-Rahmen mit durchgehender Folienmusterung und quadratischem Raritäts-Symbol — Rare-Karten sind grundsätzlich immer foliert.',
        en: 'Gold full-art frame with an all-over foil pattern and a square rarity gem — Rare cards are always foil by default.',
      },
      {
        name: 'Epic',
        de: 'Reduzierter, minimalistischer goldener Rahmen mit Folienveredelung und fünfeckigem Raritäts-Symbol — ebenfalls immer foliert.',
        en: 'A minimalist gold frame with foil treatment and a pentagonal rarity gem — also always foil.',
      },
      {
        name: 'Ultimate / Alternate Art',
        de: 'Gelbes sechseckiges Symbol auf einem alternativen Artwork — die seltenste reguläre Stufe (unter 0,1 % der Booster).',
        en: 'A yellow hexagonal symbol on an alternate artwork — the rarest regular tier (under 0.1% of boosters).',
      },
      {
        name: 'Promo',
        de: 'Sechseckiges Symbol wie Ultimate, zusätzlich mit einem eigenen Promo-Stempel gekennzeichnet — stammt nicht aus reguläreren Boostern.',
        en: 'Hexagonal symbol like Ultimate, additionally marked with its own promo stamp — not sourced from regular boosters.',
      },
    ],
  },
];
