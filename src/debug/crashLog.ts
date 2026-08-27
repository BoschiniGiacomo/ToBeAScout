export type CrashKind =
  | 'react'
  | 'js'
  | 'promise'
  | 'action'
  | 'render'
  | 'unknown';

export interface CrashEntry {
  id: string;
  at: string;
  kind: CrashKind;
  where: string;
  message: string;
  stack?: string;
  extra?: Record<string, unknown>;
}

type Listener = (entry: CrashEntry, all: CrashEntry[]) => void;

const MAX = 30;
const entries: CrashEntry[] = [];
const listeners = new Set<Listener>();

function stamp(): string {
  return new Date().toISOString();
}

function nextId(): string {
  return `crash_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function getCrashLog(): CrashEntry[] {
  return [...entries];
}

export function clearCrashLog(): void {
  entries.length = 0;
  const empty: CrashEntry[] = [];
  listeners.forEach((l) => {
    // notify with a dummy no-op via empty list — listeners only need `all`
    l(
      {
        id: 'cleared',
        at: stamp(),
        kind: 'unknown',
        where: 'clear',
        message: 'cleared',
      },
      empty,
    );
  });
}

export function subscribeCrashLog(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function logCrash(
  kind: CrashKind,
  where: string,
  error: unknown,
  extra?: Record<string, unknown>,
): CrashEntry {
  const err = error instanceof Error ? error : new Error(String(error));
  const entry: CrashEntry = {
    id: nextId(),
    at: stamp(),
    kind,
    where,
    message: err.message || String(error),
    stack: err.stack,
    extra,
  };

  entries.push(entry);
  if (entries.length > MAX) entries.shift();

  // Visible in Metro terminal
  console.error(
    [
      '',
      '========== TOBEASCOUT CRASH ==========',
      `kind:   ${entry.kind}`,
      `where:  ${entry.where}`,
      `when:   ${entry.at}`,
      `msg:    ${entry.message}`,
      extra ? `extra:  ${JSON.stringify(extra)}` : null,
      entry.stack ? `stack:\n${entry.stack}` : null,
      '=====================================',
      '',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  listeners.forEach((l) => l(entry, getCrashLog()));
  return entry;
}

/** Wrap sync/async UI actions so failures are logged instead of silent kills. */
export function safeAction<T extends unknown[], R>(
  where: string,
  fn: (...args: T) => R,
): (...args: T) => R | undefined {
  return (...args: T) => {
    try {
      const result = fn(...args);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>).catch((e) => {
          logCrash('action', where, e, { args: summarizeArgs(args) });
          return undefined;
        }) as R;
      }
      return result;
    } catch (e) {
      logCrash('action', where, e, { args: summarizeArgs(args) });
      return undefined;
    }
  };
}

function summarizeArgs(args: unknown[]): unknown {
  try {
    return JSON.parse(JSON.stringify(args, (_k, v) => (typeof v === 'function' ? '[fn]' : v)));
  } catch {
    return args.map((a) => String(a));
  }
}
