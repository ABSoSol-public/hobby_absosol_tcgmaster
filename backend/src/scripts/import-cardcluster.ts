// CLI-Import einer cardcluster.com-Sammlungs-CSV in die eigene Sammlung:
//   npm run import:cardcluster -- <csv-datei> [--dry-run]
//
// Die CSV ist Semikolon-separiert (deutsche Spaltennamen, UTF-8) und enthält
// deutsche Setnummern (z. B. "ZDC1-DE003"). Der Katalog speichert die
// YGOPRODeck-Nummern (englisch, "ZDC1-EN003") — das Script mappt daher das
// Sprach-Infix und löst Mehrdeutigkeiten (Alt-Artworks) über den deutschen
// Kartennamen auf.
//
// Idempotent: existiert derselbe Print in gleichem Zustand/Sprache/Auflage
// bereits, wird die Menge auf den CSV-Wert GESETZT (nicht addiert).
import fs from 'fs';
import path from 'path';
import { db } from '../db';

interface CsvRow {
  line: number;
  name: string;
  fullCode: string; // z. B. "ZDC1-DE003"
  rarity: string;
  setName: string;
  haves: number;
  language: string;
  firstEdition: boolean;
  condition: string;
  purchasePrice: number | null;
  storageLocation: string | null;
  notes: string | null;
}

interface PrintCandidate {
  id: number;
  collector_number: string | null;
  rarity: string | null;
  name: string;
  name_de: string | null;
}

// cardcluster kodiert den Zustand numerisch aufsteigend (7 = Mint … 1 = Poor).
const CONDITION_MAP: Record<string, string> = {
  '7': 'MT',
  '6': 'NM',
  '5': 'EX',
  '4': 'GD',
  '3': 'LP',
  '2': 'PL',
  '1': 'PO',
};

/** Minimaler CSV-Parser mit Quote-Unterstützung, Trennzeichen Semikolon. */
function parseCsv(text: string, delimiter = ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const normName = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Ziffernteil der Kartennummer, z. B. "ZDC1-DE003" → "003". */
const numberPart = (code: string): string => {
  const after = code.split('-').slice(1).join('-');
  const m = (after || code).match(/(\d+[a-z]?)$/i);
  return m ? m[1].replace(/^0+(?=\d)/, '') : '';
};

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const dryRun = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Verwendung: npm run import:cardcluster -- <csv-datei> [--dry-run]');
    process.exit(1);
  }

  const text = fs.readFileSync(path.resolve(file), 'utf8').replace(/^﻿/, '');
  const rawRows = parseCsv(text);
  const header = rawRows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string): number => header.indexOf(name.toLowerCase());
  for (const required of ['name', 'set-kürzel', 'rarität', 'haves']) {
    if (idx(required) < 0) throw new Error(`Spalte "${required}" fehlt — ist das eine cardcluster-Export-CSV?`);
  }
  const col = (row: string[], name: string): string => (row[idx(name)] || '').trim();

  const rows: CsvRow[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    const haves = Number(col(r, 'Haves') || 0);
    if (haves < 1) continue; // reine Wants überspringen
    const zustand = col(r, 'Zustand');
    const priceRaw = col(r, 'Einkaufspreis');
    const noteParts = [col(r, 'Notizen'), col(r, 'Herkunft') ? `Herkunft: ${col(r, 'Herkunft')}` : '']
      .filter(Boolean);
    rows.push({
      line: i + 1,
      name: col(r, 'Name'),
      fullCode: col(r, 'Set-Kürzel'),
      rarity: col(r, 'Rarität'),
      setName: col(r, 'Set-Name'),
      haves,
      language: (col(r, 'Sprache') || 'de').toUpperCase(),
      firstEdition: col(r, 'Edition').toUpperCase() === '1E',
      condition: CONDITION_MAP[zustand] || 'NM',
      purchasePrice: priceRaw ? Number(priceRaw.replace(',', '.')) : null,
      storageLocation: col(r, 'Einsortiert in') || null,
      notes: noteParts.length ? noteParts.join(' | ') : null,
    });
  }
  console.log(`${rows.length} Sammlungszeilen gelesen${dryRun ? ' (Dry-Run: es wird nichts geschrieben)' : ''}.`);

  const game = await db('games').where({ code: 'yugioh' }).first();
  if (!game) throw new Error('Spiel "yugioh" fehlt in der games-Tabelle.');

  // Prints je Set einmalig laden (Cache), inkl. Kartennamen zur Disambiguierung.
  const setIdByCode = new Map<string, number | null>(
    (await db('card_sets').where('game_id', game.id).select('id', 'code')).map((r) => [r.code, r.id])
  );
  const printsBySet = new Map<number, PrintCandidate[]>();
  const printsOfSet = async (setId: number): Promise<PrintCandidate[]> => {
    let prints = printsBySet.get(setId);
    if (!prints) {
      prints = (await db('card_prints')
        .join('cards', 'card_prints.card_id', 'cards.id')
        .where('card_prints.set_id', setId)
        .select(
          'card_prints.id',
          'card_prints.collector_number',
          'card_prints.rarity',
          'cards.name',
          'cards.name_de'
        )) as PrintCandidate[];
      printsBySet.set(setId, prints);
    }
    return prints;
  };

  const unmatched: { row: CsvRow; reason: string }[] = [];
  const warnings: string[] = [];
  let stubs = 0;
  let dryRunStubId = -1; // eindeutige Platzhalter-IDs, damit Dry-Run-Stubs nicht aufeinander aggregieren
  // Aggregation über den Sammlungs-Schlüssel, damit doppelte CSV-Zeilen
  // (gleicher Print, gleicher Zustand) nicht in zwei Upserts enden.
  const aggregated = new Map<string, { printId: number; row: CsvRow; quantity: number }>();

  for (const row of rows) {
    const setCode = row.fullCode.split('-')[0].trim();
    const setId = setIdByCode.get(setCode);
    if (!setId) {
      unmatched.push({ row, reason: `Set "${setCode}" nicht im Katalog` });
      continue;
    }
    const prints = await printsOfSet(setId);

    // 1) Nummer matchen: exakt, dann Sprach-Infix DE→EN, dann nur Ziffernteil
    const enCode = row.fullCode.replace('-DE', '-EN');
    let candidates = prints.filter((p) => p.collector_number === row.fullCode);
    if (!candidates.length) candidates = prints.filter((p) => p.collector_number === enCode);
    if (!candidates.length) {
      const num = numberPart(row.fullCode);
      if (num) candidates = prints.filter((p) => p.collector_number && numberPart(p.collector_number) === num);
    }
    if (!candidates.length) {
      // 2) Fallback: über den (deutschen) Kartennamen im Set
      const n = normName(row.name);
      candidates = prints.filter((p) => (p.name_de && normName(p.name_de) === n) || normName(p.name) === n);
      if (candidates.length) warnings.push(`Zeile ${row.line}: "${row.fullCode}" nur über Kartennamen gefunden.`);
    }
    if (!candidates.length) {
      // 2b) Print fehlt im Katalog (YGOPRODeck ist bei manchen Sets unvollständig,
      //     z. B. EU-Nummern oder Tin-Promos). Karte global über den (deutschen)
      //     Namen auflösen und einen Print-Stub im Set anlegen.
      const n = normName(row.name);
      const cardMatches = await db('cards')
        .where('game_id', game.id)
        .where((qb) => {
          qb.whereRaw('LOWER(name_de) = ?', [n]).orWhereRaw('LOWER(name) = ?', [n]);
        })
        .select('id', 'name');
      if (cardMatches.length === 1) {
        const collectorNumber = enCode.includes('?') ? null : enCode;
        const stubRarity = row.rarity || null;
        let printId: number;
        if (dryRun) {
          printId = dryRunStubId--; // Platzhalter — im Dry-Run wird nichts angelegt
        } else {
          await db('card_prints')
            .insert({ card_id: cardMatches[0].id, set_id: setId, collector_number: collectorNumber, rarity: stubRarity })
            .onConflict(['card_id', 'set_id', 'collector_number', 'rarity'])
            .merge(['rarity']);
          const stub = await db('card_prints')
            .where({ card_id: cardMatches[0].id, set_id: setId, rarity: stubRarity })
            .where((qb) => {
              collectorNumber === null
                ? qb.whereNull('collector_number')
                : qb.where('collector_number', collectorNumber);
            })
            .first();
          printId = stub.id;
        }
        stubs++;
        warnings.push(`Zeile ${row.line}: "${row.fullCode}" fehlt im Katalog — Print-Stub für "${cardMatches[0].name}" angelegt.`);
        candidates = [{ id: printId, collector_number: collectorNumber, rarity: stubRarity, name: cardMatches[0].name, name_de: null }];
        // Stub in den Cache aufnehmen, damit Folgezeilen ihn wiederfinden
        prints.push(candidates[0]);
      } else {
        const reason =
          cardMatches.length > 1
            ? `Nummer "${row.fullCode}" fehlt und Name "${row.name}" ist mehrdeutig (${cardMatches.length} Karten)`
            : `Nummer "${row.fullCode}" nicht im Set ${setCode}, Karte "${row.name}" nicht im Katalog`;
        unmatched.push({ row, reason });
        continue;
      }
    }

    // 3) Rarität eingrenzen. cardcluster benennt Varianten teils feiner als
    //    YGOPRODeck ("Prismatic Collector's Rare" vs. "Collector's Rare") —
    //    daher Scoring über Teilstring-Übereinstimmung, längster Treffer gewinnt.
    const csvRarity = row.rarity.toLowerCase();
    const score = (p: PrintCandidate): number => {
      const r = (p.rarity || '').toLowerCase();
      if (!r) return 0;
      if (r === csvRarity) return 1000;
      if (csvRarity.includes(r)) return r.length;
      if (r.includes(csvRarity)) return csvRarity.length;
      return 0;
    };
    const best = Math.max(...candidates.map(score));
    if (best > 0) candidates = candidates.filter((p) => score(p) === best);
    else if (row.rarity)
      warnings.push(
        `Zeile ${row.line}: Rarität "${row.rarity}" nicht gefunden für ${row.fullCode} — nehme ${candidates[0].rarity ?? 'unbekannt'}.`
      );

    // 4) Bei Mehrdeutigkeit (z. B. Alt-Artwork) über den Namen entscheiden
    if (candidates.length > 1) {
      const n = normName(row.name);
      const byName = candidates.filter(
        (p) => (p.name_de && normName(p.name_de) === n) || normName(p.name) === n
      );
      if (byName.length) candidates = byName;
      if (candidates.length > 1)
        warnings.push(
          `Zeile ${row.line}: ${candidates.length} Prints für ${row.fullCode} (${row.rarity}) — nehme den ersten.`
        );
    }

    const print = candidates[0];
    const key = `${print.id}|${row.condition}|${row.language}|${row.firstEdition ? 1 : 0}`;
    const existing = aggregated.get(key);
    if (existing) existing.quantity += row.haves;
    else aggregated.set(key, { printId: print.id, row, quantity: row.haves });
  }

  console.log(
    `${aggregated.size} eindeutige Sammlungseinträge aufgelöst (davon ${stubs} über Print-Stubs), ${unmatched.length} Zeilen ohne Treffer, ${warnings.length} Hinweise.`
  );
  for (const w of warnings.slice(0, 20)) console.log(`  Hinweis: ${w}`);
  if (warnings.length > 20) console.log(`  … und ${warnings.length - 20} weitere Hinweise.`);

  // Nicht auflösbare Zeilen als CSV neben der Eingabedatei ablegen
  if (unmatched.length) {
    const reportPath = path.resolve(file).replace(/\.csv$/i, '') + '.unmatched.csv';
    const esc = (v: string): string => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = unmatched.map(({ row, reason }) =>
      [row.name, row.fullCode, row.rarity, row.setName, String(row.haves), reason].map(esc).join(';')
    );
    fs.writeFileSync(reportPath, '﻿' + ['Name;Set-Kürzel;Rarität;Set-Name;Haves;Grund', ...lines].join('\r\n') + '\r\n');
    console.log(`Nicht zugeordnete Zeilen: ${reportPath}`);
  }

  if (dryRun) {
    console.log('Dry-Run beendet — keine Änderungen geschrieben.');
    await db.destroy();
    return;
  }

  let created = 0;
  let updated = 0;
  for (const { printId, row, quantity } of aggregated.values()) {
    const match = await db('collection_items')
      .where({
        print_id: printId,
        condition: row.condition,
        language: row.language,
        is_first_edition: row.firstEdition ? 1 : 0,
      })
      .first();
    const fields = {
      storage_location: row.storageLocation,
      purchase_price: row.purchasePrice,
      notes: row.notes,
    };
    if (match) {
      await db('collection_items').where('id', match.id).update({ quantity, ...fields, updated_at: db.fn.now() });
      updated++;
    } else {
      await db('collection_items').insert({
        print_id: printId,
        quantity,
        condition: row.condition,
        language: row.language,
        is_first_edition: row.firstEdition ? 1 : 0,
        ...fields,
      });
      created++;
    }
  }

  const totalCopies = [...aggregated.values()].reduce((s, e) => s + e.quantity, 0);
  console.log(`Fertig: ${created} Einträge neu, ${updated} aktualisiert, ${totalCopies} Karten insgesamt.`);
  await db.destroy();
}

main().catch(async (err) => {
  console.error(err.message);
  await db.destroy();
  process.exit(1);
});
