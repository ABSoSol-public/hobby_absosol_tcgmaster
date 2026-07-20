import { GameImporter } from './types';
import { yugiohImporter } from './yugioh';
import { lorcanaImporter } from './lorcana';
import { pokemonImporter } from './pokemon';
import { magicImporter } from './magic';
import { riftboundImporter } from './riftbound';

// Registry aller verfügbaren Importer.
// Neues Spiel: Importer implementieren und hier eintragen.
export const importers: Record<string, GameImporter> = {
  [yugiohImporter.gameCode]: yugiohImporter,
  [lorcanaImporter.gameCode]: lorcanaImporter,
  [pokemonImporter.gameCode]: pokemonImporter,
  [magicImporter.gameCode]: magicImporter,
  [riftboundImporter.gameCode]: riftboundImporter,
};
