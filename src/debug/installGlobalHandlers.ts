import { logCrash } from './crashLog';

declare const ErrorUtils: {
  getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

let installed = false;

export function installGlobalCrashHandlers(): void {
  if (installed) return;
  installed = true;

  const previous =
    typeof ErrorUtils !== 'undefined' && ErrorUtils.getGlobalHandler
      ? ErrorUtils.getGlobalHandler()
      : undefined;

  if (typeof ErrorUtils !== 'undefined' && ErrorUtils.setGlobalHandler) {
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      logCrash('js', isFatal ? 'GlobalFatal' : 'GlobalError', error, { isFatal: !!isFatal });
      if (previous) {
        try {
          previous(error, isFatal);
        } catch (e) {
          logCrash('js', 'PreviousGlobalHandler', e);
        }
      }
    });
  }

  const g = globalThis as typeof globalThis & {
    onunhandledrejection?: ((e: PromiseRejectionEvent) => void) | null;
    addEventListener?: (type: string, listener: (e: PromiseRejectionEvent) => void) => void;
  };

  const onRejection = (reason: unknown) => {
    logCrash('promise', 'UnhandledPromiseRejection', reason);
  };

  try {
    if (typeof g.addEventListener === 'function') {
      g.addEventListener('unhandledrejection', (e) => {
        onRejection((e as PromiseRejectionEvent).reason);
      });
    }
  } catch (e) {
    logCrash('unknown', 'installUnhandledRejection', e);
  }

  // Hermes / RN sometimes expose this
  try {
    const tracking = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: (cb: (id: number, rejection: unknown) => void) => void } }).HermesInternal;
    tracking?.enablePromiseRejectionTracker?.((_id, rejection) => {
      onRejection(rejection);
    });
  } catch {
    // ignore
  }

  console.log('[ToBeAScout] crash handlers installed — look for TOBEASCOUT CRASH in Metro logs');
}
