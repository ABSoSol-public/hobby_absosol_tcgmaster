// Aktives Spiel (Yu-Gi-Oh!, Pokémon, Magic, Lorcana, …) als App-weiter Kontext.
// Die Auswahl wird im localStorage gehalten; die Spieleliste kommt vom Backend.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { Game } from './types';

const STORAGE_KEY = 'tcg-game';

interface GameContextValue {
  /** Code des aktiven Spiels, z. B. "yugioh". */
  game: string;
  setGame: (code: string) => void;
  /** Alle Spiele inkl. Zählern (für Umschalter und Dashboard). */
  games: Game[];
  reloadGames: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [game, setGameState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'yugioh');
  const [games, setGames] = useState<Game[]>([]);

  const reloadGames = useCallback(() => {
    api.games().then((r) => setGames(r.data)).catch(() => {});
  }, []);

  useEffect(reloadGames, [reloadGames]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, game);
  }, [game]);

  const value = useMemo<GameContextValue>(
    () => ({ game, setGame: setGameState, games, reloadGames }),
    [game, games, reloadGames]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame muss innerhalb von GameProvider verwendet werden');
  return ctx;
}
