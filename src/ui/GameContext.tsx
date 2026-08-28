import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from 'react';
import type { CombatState, GameState } from '../sim/types';
import { loadGame, resetGame, saveGame } from '../save/storage';
import { tick } from '../sim/tick';
import { placeBuilding, startUpgrade, collectFromBuilding, moveBuilding } from '../sim/buildings';
import { enqueueTraining, troopStatsForPlayer } from '../sim/training';
import { applyMissionResult, canStartMission } from '../sim/campaign';
import {
  autoDeployAll,
  createCombatState,
  deployTroop,
  stepCombat,
} from '../sim/combat';
import { createInitialState, buyResourcePack, type ResourcePackId } from '../sim/economy';
import { startTroopUpgrade } from '../sim/troopUpgrades';
import { logCrash, safeAction } from '../debug/crashLog';

interface GameContextValue {
  state: GameState;
  ready: boolean;
  message: string | null;
  clearMessage: () => void;
  showMessage: (message: string) => void;
  place: (buildingId: string, x: number, y: number) => void;
  upgrade: (instanceId: string) => void;
  collect: (instanceId: string) => void;
  train: (troopId: string) => void;
  upgradeTroop: (troopId: string) => void;
  buyPack: (packId: ResourcePackId) => void;
  startMission: (missionId: string) => CombatState | null | undefined;
  combat: CombatState | null;
  deploy: (troopId: string, x: number, y: number) => void;
  autoDeploy: () => void;
  finishCombat: () => void;
  reset: () => Promise<void> | undefined;
  setPlacementBuilding: (id: string | null) => void;
  placementBuilding: string | null;
  movingBuildingId: string | null;
  setMovingBuildingId: (id: string | null) => void;
  move: (instanceId: string, x: number, y: number) => void;
  selectedBuildingId: string | null;
  setSelectedBuildingId: (id: string | null) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(createInitialState);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [placementBuilding, setPlacementBuildingState] = useState<string | null>(null);
  const [movingBuildingId, setMovingBuildingIdState] = useState<string | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [combat, setCombat] = useState<CombatState | null>(null);
  const combatRef = useRef<CombatState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  combatRef.current = combat;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const loaded = await loadGame();
        if (mounted) {
          setState(loaded);
          setReady(true);
        }
      } catch (e) {
        logCrash('promise', 'loadGame', e);
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      try {
        setState((s) => {
          const next = tick(s, Date.now());
          if (next === s) return s;
          void saveGame(next).catch((e) => logCrash('promise', 'autosave', e));
          return next;
        });
      } catch (e) {
        logCrash('action', 'gameTick', e);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (!combat) return;
    let frame = 0;
    let last = Date.now();
    const loop = () => {
      try {
        const now = Date.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        setCombat((c) => {
          if (!c || c.finished) return c;
          try {
            return stepCombat(c, dt);
          } catch (e) {
            logCrash('action', 'stepCombat', e, { missionId: c.missionId });
            return { ...c, finished: true, victory: false };
          }
        });
      } catch (e) {
        logCrash('action', 'combatLoop', e);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [combat?.missionId, combat?.finished]);

  const persist = useCallback((next: GameState) => {
    setState(next);
    void saveGame(next).catch((e) => logCrash('promise', 'saveGame', e));
  }, []);

  const clearMessage = useCallback(() => setMessage(null), []);
  const showMessage = useCallback((msg: string) => setMessage(msg), []);

  const setPlacementBuilding = useCallback((id: string | null) => {
    setPlacementBuildingState(id);
    if (id) setMovingBuildingIdState(null);
  }, []);

  const setMovingBuildingId = useCallback((id: string | null) => {
    setMovingBuildingIdState(id);
    if (id) setPlacementBuildingState(null);
  }, []);

  const place = useCallback(
    safeAction('placeBuilding', (buildingId: string, x: number, y: number) => {
      const result = placeBuilding(tick(stateRef.current), buildingId, x, y);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      startTransition(() => {
        persist(result.state);
        setPlacementBuildingState(null);
      });
      setMessage(`${buildingId} in costruzione`);
    }),
    [persist],
  );

  const move = useCallback(
    safeAction('moveBuilding', (instanceId: string, x: number, y: number) => {
      const result = moveBuilding(tick(stateRef.current), instanceId, x, y);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      startTransition(() => {
        persist(result.state);
        setMovingBuildingIdState(null);
      });
      setMessage('Edificio spostato');
    }),
    [persist],
  );

  const upgrade = useCallback(
    safeAction('upgradeBuilding', (instanceId: string) => {
      const result = startUpgrade(tick(stateRef.current), instanceId);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      persist(result.state);
      setMessage('Upgrade avviato');
    }),
    [persist],
  );

  const collect = useCallback(
    safeAction('collectBuilding', (instanceId: string) => {
      persist(collectFromBuilding(tick(stateRef.current), instanceId));
    }),
    [persist],
  );

  const train = useCallback(
    safeAction('trainTroop', (troopId: string) => {
      const result = enqueueTraining(tick(stateRef.current), troopId);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      persist(result.state);
      setMessage('Addestramento avviato');
    }),
    [persist],
  );

  const upgradeTroop = useCallback(
    safeAction('upgradeTroop', (troopId: string) => {
      const result = startTroopUpgrade(tick(stateRef.current), troopId);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      persist(result.state);
      setMessage('Upgrade truppa avviato');
    }),
    [persist],
  );

  const buyPack = useCallback(
    safeAction('buyResourcePack', (packId: ResourcePackId) => {
      const result = buyResourcePack(tick(stateRef.current), packId);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      persist(result.state);
      setMessage('Risorse acquistate');
    }),
    [persist],
  );

  const startMission = useCallback(
    safeAction('startMission', (missionId: string) => {
      const check = canStartMission(stateRef.current, missionId);
      if (!check.ok) {
        setMessage(check.reason);
        return null;
      }
      const c = createCombatState(missionId, stateRef.current.army, stateRef.current.troopLevels);
      setCombat(c);
      return c;
    }),
    [],
  );

  const deploy = useCallback(
    safeAction('deployTroop', (troopId: string, x: number, y: number) => {
      setCombat((c) => (c ? deployTroop(c, troopId, x, y) : c));
    }),
    [],
  );

  const autoDeploy = useCallback(
    safeAction('autoDeploy', () => {
      setCombat((c) => (c ? autoDeployAll(c) : c));
    }),
    [],
  );

  const finishCombat = useCallback(
    safeAction('finishCombat', () => {
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
    }),
    [persist],
  );

  const reset = useCallback(
    safeAction('resetGame', async () => {
      const fresh = await resetGame();
      setState(fresh);
      setCombat(null);
      setMessage('Nuova partita');
    }),
    [],
  );

  const value = useMemo(
    () => ({
      state,
      ready,
      message,
      clearMessage,
      showMessage,
      place,
      upgrade,
      collect,
      train,
      upgradeTroop,
      buyPack,
      startMission,
      combat,
      deploy,
      autoDeploy,
      finishCombat,
      reset,
      setPlacementBuilding,
      placementBuilding,
      movingBuildingId,
      setMovingBuildingId,
      move,
      selectedBuildingId,
      setSelectedBuildingId,
    }),
    [
      state,
      ready,
      message,
      clearMessage,
      showMessage,
      place,
      upgrade,
      collect,
      train,
      upgradeTroop,
      buyPack,
      startMission,
      combat,
      deploy,
      autoDeploy,
      finishCombat,
      reset,
      placementBuilding,
      movingBuildingId,
      move,
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
