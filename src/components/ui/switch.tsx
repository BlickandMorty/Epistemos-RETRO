"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { useIsDark } from "@/hooks/use-is-dark"

/**
 * iOS-style toggle switch — polished, with smooth transitions.
 *
 * Sizes:
 *   "default"  → 44 × 26 px  (matches iOS proportions)
 *   "sm"       → 36 × 20 px  (compact for inline use)
 *
 * Color:
 *   Override the checked color with `activeColor` prop or via className:
 *   `data-[state=checked]:bg-pfc-violet`
 *
 *   In default light mode, all switches use OLED pitch black (#000000) regardless of activeColor.
 *   activeColor applies in dark mode AND sunny theme (sunny uses CSS variables).
 */
function Switch({
  className,
  size = "default",
  activeColor,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
  activeColor?: string
}) {
  const { isDark, isSunny } = useIsDark()
  // Only force OLED black on default light mode — sunny and dark themes keep their own colors
  const isDefaultLight = !isDark && !isSunny
  const resolvedActiveColor = isDefaultLight ? undefined : activeColor

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        // Layout
        "group/switch relative inline-flex shrink-0 items-center rounded-full cursor-pointer",
        // Focus
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        // Disabled
        "disabled:cursor-not-allowed disabled:opacity-40",
        // Transitions
        "transition-colors duration-200 ease-in-out",
        // Size variants
        size === "default" ? "h-[26px] w-[44px]" : "h-[20px] w-[36px]",
        // Track colors (unchecked)
        "data-[state=unchecked]:bg-[#787880]/30 dark:data-[state=unchecked]:bg-[#636366]/50",
        // Track colors (checked) — OLED pitch black in default light, iOS green in dark, sunny uses primary
        !resolvedActiveColor && !isSunny && "data-[state=checked]:bg-[#000000] dark:data-[state=checked]:bg-[#30D158]",
        !resolvedActiveColor && isSunny && "data-[state=checked]:bg-[var(--primary)]",
        className,
      )}
      style={resolvedActiveColor ? {
        // Allow runtime color override (dark mode only)
        ...(props.checked || (props as Record<string, unknown>)['data-state'] === 'checked'
          ? { backgroundColor: resolvedActiveColor }
          : {}),
      } : undefined}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // Base
          "pointer-events-none block rounded-full bg-white",
          // Shadow for depth (iOS style)
          "shadow-[0_2px_4px_rgba(0,0,0,0.15),0_0_1px_rgba(0,0,0,0.1)]",
          // Transition
          "transition-transform duration-200 ease-in-out",
          // Size & position
          size === "default"
            ? "size-[22px] data-[state=unchecked]:translate-x-[2px] data-[state=checked]:translate-x-[20px]"
            : "size-[16px] data-[state=unchecked]:translate-x-[2px] data-[state=checked]:translate-x-[18px]",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
