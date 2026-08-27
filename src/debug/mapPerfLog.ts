/** Lightweight map diagnostics — look for [MAP] in Metro. */
type MapLogPayload = Record<string, string | number | boolean | null | undefined>;

let panCount = 0;
let lastPanAt = 0;

export function mapLog(event: string, payload?: MapLogPayload): void {
  const t = Date.now();
  const extra = payload
    ? ' ' +
      Object.entries(payload)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
    : '';
  // eslint-disable-next-line no-console
  console.log(`[MAP ${t}] ${event}${extra}`);
}

export function mapLogPanBegin(mode: string, buildings: number): void {
  panCount += 1;
  const now = Date.now();
  const dt = lastPanAt ? now - lastPanAt : -1;
  lastPanAt = now;
  mapLog('pan.begin', { n: panCount, mode, buildings, sinceLastMs: dt });
}

export function mapLogPanEnd(): void {
  mapLog('pan.end', { n: panCount });
}

export function mapLogMount(info: MapLogPayload): void {
  mapLog('world.mount', info);
}
