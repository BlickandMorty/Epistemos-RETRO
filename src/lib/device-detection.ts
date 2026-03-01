/**
 * Device detection — simplified for desktop-only Tauri app.
 * The Mac version equivalent is handled natively; this is just a stub.
 */

export interface DeviceProfile {
  deviceClass: 'desktop';
  summary: string;
}

export function detectDevice(): DeviceProfile {
  return {
    deviceClass: 'desktop',
    summary: 'Tauri desktop app',
  };
}
