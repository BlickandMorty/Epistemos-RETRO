'use client';

/**
 * Pixel-art sun mascot -- uses the actual GIF image directly.
 */
export function PixelSun({ size = 40 }: { size?: number }) {
  return (
    <img
      src="/pixel-sun.gif"
      alt="Sun mascot"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        imageRendering: 'pixelated',
      }}
    />
  );
}

/**
 * Landing moon mascot for dark/oled mode.
 * Uses the user-provided animated GIF asset.
 */
export function PixelMoon({ size = 40 }: { size?: number }) {
  return (
    <img
      src="/moon-dark.gif"
      alt="Moon mascot"
      width={size}
      height={size}
      style={{
        flexShrink: 0,
        imageRendering: 'pixelated',
        borderRadius: '50%',
      }}
    />
  );
}

/**
 * Simple CSS loading spinner -- replaces the old pixel-book GIF.
 */
export function PixelBook({ size = 32 }: { size?: number }) {
  const borderWidth = Math.max(2, Math.round(size / 12));
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        border: `${borderWidth}px solid var(--pfc-accent-border)`,
        borderTopColor: 'var(--pfc-accent)',
        animation: 'spin 0.7s linear infinite',
      }}
    />
  );
}
