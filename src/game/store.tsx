import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useOnlineEngine } from "../online/online-engine";
import type { Game } from "./engine";
import { useSimEngine } from "./sim-engine";

export type Mode = "online" | "practice";

interface Ctx {
  game: Game;
  mode: Mode;
  setMode: (m: Mode) => void;
  name: string | null;
  setName: (n: string) => void;
}

const NAME_KEY = "scram.name";
const GameCtx = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("online");
  const [name, setNameState] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(NAME_KEY)
      .then((n) => n && setNameState(n))
      .catch(() => {});
  }, []);

  const setName = useCallback((n: string) => {
    setNameState(n);
    AsyncStorage.setItem(NAME_KEY, n).catch(() => {});
  }, []);

  // Both engines stay mounted so switching modes never loses a running game.
  const online = useOnlineEngine(name);
  const practice = useSimEngine();
  const game = mode === "online" ? online : practice;

  return <GameCtx.Provider value={{ game, mode, setMode, name, setName }}>{children}</GameCtx.Provider>;
}

function useCtx() {
  const c = useContext(GameCtx);
  if (!c) throw new Error("useGame must be used inside GameProvider");
  return c;
}

export const useGame = () => useCtx().game;
export const useAppMode = () => {
  const { mode, setMode, name, setName } = useCtx();
  return { mode, setMode, name, setName };
};
