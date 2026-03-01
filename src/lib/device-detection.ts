// ═══════════════════════════════════════════════════════════════════
// Device Detection — Smart Suite Tier Recommendation
// ═══════════════════════════════════════════════════════════════════

import type { SuiteTier } from '@/lib/research/types';

export interface DeviceProfile {
  /** Detected device class */
  deviceClass: 'phone' | 'tablet' | 'laptop' | 'desktop' | 'unknown';
  /** Logical CPU cores */
  cpuCores: number;
  /** Device memory in GB (if available, 0 = unknown) */
  memoryGB: number;
  /** Screen width in logical pixels */
  screenWidth: number;
  /** Whether the device supports touch */
  hasTouch: boolean;
  /** Whether it's likely a mobile OS */
  isMobileOS: boolean;
  /** Recommended suite tier based on hardware */
  recommendedTier: SuiteTier;
  /** Can the device handle the next tier up? */
  canUpgrade: boolean;
  /** Human-readable summary */
  summary: string;
}

/**
 * Detect device capabilities and recommend a suite tier.
 * Runs client-side only.
 */
export function detectDevice(): DeviceProfile {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return fallbackProfile();
  }

  const cpuCores = navigator.hardwareConcurrency || 0;
  const memoryGB = (navigator as { deviceMemory?: number }).deviceMemory || 0;
  const screenWidth = window.screen?.width || window.innerWidth || 0;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const ua = navigator.userAgent.toLowerCase();

  // Mobile OS detection
  const isMobileOS = /android|iphone|ipad|ipod|mobile|webos|opera mini|iemobile/i.test(ua);
  const isTablet = /ipad|tablet|playbook|silk/i.test(ua)
    || (hasTouch && screenWidth >= 768 && screenWidth < 1200);

  // Device classification
  let deviceClass: DeviceProfile['deviceClass'] = 'unknown';

  if (isMobileOS && !isTablet) {
    deviceClass = 'phone';
  } else if (isTablet) {
    deviceClass = 'tablet';
  } else if (screenWidth < 1440 || (cpuCores > 0 && cpuCores <= 4)) {
    deviceClass = 'laptop';
  } else {
    deviceClass = 'desktop';
  }

  // Single mode — always programming, all features enabled
  const recommendedTier: SuiteTier = 'programming';
  const canUpgrade = false;

  // Build summary
  const coreStr = cpuCores > 0 ? `${cpuCores} cores` : 'unknown cores';
  const memStr = memoryGB > 0 ? `${memoryGB}GB RAM` : 'unknown RAM';
  const summary = `${deviceClass} (${coreStr}, ${memStr}, ${screenWidth}px)`;

  return {
    deviceClass,
    cpuCores,
    memoryGB,
    screenWidth,
    hasTouch,
    isMobileOS,
    recommendedTier,
    canUpgrade,
    summary,
  };
}

function fallbackProfile(): DeviceProfile {
  return {
    deviceClass: 'unknown',
    cpuCores: 0,
    memoryGB: 0,
    screenWidth: 0,
    hasTouch: false,
    isMobileOS: false,
    recommendedTier: 'programming',
    canUpgrade: true,
    summary: 'Server-side render — defaults to programming tier',
  };
}

import { writeVersioned } from '@/lib/storage-versioning';

/** Storage key for persisted device profile */
const DEVICE_PROFILE_KEY = 'pfc-device-profile';
const DEVICE_PROFILE_VERSION = 1;

/** Cache device profile to localStorage */
export function cacheDeviceProfile(profile: DeviceProfile): void {
  writeVersioned(DEVICE_PROFILE_KEY, DEVICE_PROFILE_VERSION, profile);
}

