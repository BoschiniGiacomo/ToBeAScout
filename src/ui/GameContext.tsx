import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CombatState, GameState } from '../sim/types';
import { loadGame, resetGame, saveGame } from '../save/storage';
import { tick } from '../sim/tick';
import { placeBuilding, startUpgrade, collectFromBuilding } from '../sim/buildings';
import { enqueueTraining } from '../sim/training';
import { applyMissionResult, canStartMission } from '../sim/campaign';
import {
  autoDeployAll,
  createCombatState,
  deployTroop,
  stepCombat,
} from '../sim/combat';
import { createInitialState } from '../sim/economy';

interface GameContextValue {
  state: GameState;
  ready: boolean;
  message: string | null;
  clearMessage: () => void;
  place: (buildingId: string, x: number, y: number) => void;
  upgrade: (instanceId: string) => void;
  collect: (instanceId: string) => void;
  train: (troopId: string) => void;
  startMission: (missionId: string) => CombatState | null;
  combat: CombatState | null;
  deploy: (troopId: string, x: number, y: number) => void;
  autoDeploy: () => void;
  finishCombat: () => void;
  reset: () => Promise<void>;
  setPlacementBuilding: (id: string | null) => void;
  placementBuilding: string | null;
  selectedBuildingId: string | null;
  setSelectedBuildingId: (id: string | null) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(createInitialState);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [placementBuilding, setPlacementBuilding] = useState<string | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [combat, setCombat] = useState<CombatState | null>(null);
  const combatRef = useRef<CombatState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  combatRef.current = combat;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const loaded = await loadGame();
      if (mounted) {
        setState(loaded);
        setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      setState((s) => {
        const next = tick(s, Date.now());
        if (next === s) return s;
        void saveGame(next);
        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (!combat) return;
    let frame = 0;
    let last = Date.now();
    const loop = () => {
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setCombat((c) => {
        if (!c || c.finished) return c;
        return stepCombat(c, dt);
      });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [combat?.missionId, combat?.finished]);

  const persist = useCallback((next: GameState) => {
    setState(next);
    void saveGame(next);
  }, []);

  const clearMessage = useCallback(() => setMessage(null), []);

  const place = useCallback(
    (buildingId: string, x: number, y: number) => {
      const result = placeBuilding(tick(stateRef.current), buildingId, x, y);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      persist(result.state);
      setPlacementBuilding(null);
      setMessage(`${buildingId} in costruzione`);
    },
    [persist],
  );

  const upgrade = useCallback(
    (instanceId: string) => {
      const result = startUpgrade(tick(stateRef.current), instanceId);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      persist(result.state);
      setMessage('Upgrade avviato');
    },
    [persist],
  );

  const collect = useCallback(
    (instanceId: string) => {
      persist(collectFromBuilding(tick(stateRef.current), instanceId));
    },
    [persist],
  );

  const train = useCallback(
    (troopId: string) => {
      const result = enqueueTraining(tick(stateRef.current), troopId);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      persist(result.state);
      setMessage('Addestramento avviato');
    },
    [persist],
  );

  const startMission = useCallback((missionId: string) => {
    const check = canStartMission(stateRef.current, missionId);
    if (!check.ok) {
      setMessage(check.reason);
      return null;
    }
    const c = createCombatState(missionId, stateRef.current.army);
    setCombat(c);
    return c;
  }, []);

  const deploy = useCallback((troopId: string, x: number, y: number) => {
    setCombat((c) => (c ? deployTroop(c, troopId, x, y) : c));
  }, []);

  const autoDeploy = useCallback(() => {
    setCombat((c) => (c ? autoDeployAll(c) : c));
  }, []);

  const finishCombat = useCallback(() => {
    const c = combatRef.current;
    if (!c) return;
    const next = applyMissionResult(
      tick(stateRef.current),
      c.missionId,
      c.stars,
      c.victory,
    );
    persist(next);
    setCombat(null);
    if (c.victory) setMessage(`Missione completata! ${c.stars}★`);
    else setMessage('Missione fallita');
  }, [persist]);

  const reset = useCallback(async () => {
    const fresh = await resetGame();
    setState(fresh);
    setCombat(null);
    setMessage('Nuova partita');
  }, []);

  const value = useMemo(
    () => ({
      state,
      ready,
      message,
      clearMessage,
      place,
      upgrade,
      collect,
      train,
      startMission,
      combat,
      deploy,
      autoDeploy,
      finishCombat,
      reset,
      setPlacementBuilding,
      placementBuilding,
      selectedBuildingId,
      setSelectedBuildingId,
    }),
    [
      state,
      ready,
      message,
      clearMessage,
      place,
      upgrade,
      collect,
      train,
      startMission,
      combat,
      deploy,
      autoDeploy,
      finishCombat,
      reset,
      placementBuilding,
      selectedBuildingId,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame outside provider');
  return ctx;
}
