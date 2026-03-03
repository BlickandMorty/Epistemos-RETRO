# Settings Page Design — Retro Edition

## Decision: Translate brainiac-2.0 Sections (Approach A)

Port the 4 section components from brainiac-2.0, replacing `fetch()` with Tauri `invoke()` and web `localStorage` with backend SQLite where the Rust pipeline needs the config. Theme stays in localStorage (purely CSS). SOAR uses localStorage as interim (no backend commands yet).

## File Structure

```
src/pages/settings.tsx                           ← Orchestrator
src/components/settings/inference-section.tsx     ← LLM config
src/components/settings/appearance-section.tsx    ← Themes
src/components/settings/soar-section.tsx          ← Meta-reasoning tuning
src/components/settings/data-section.tsx          ← Vault + cost + reset
```

## Section 1: InferenceSection

Two modes toggled by GlassBubbleButton pair: **API** and **Local**.

**API mode:** Provider selector (Anthropic/OpenAI/Google as GlassBubbleButtons), model dropdown (per-provider defaults), API key input (password field), Test Connection button with toast feedback.

**Local mode:** Auto-probes `checkLocalServices()` on mount. Status cards for Foundry Local and Ollama (green/red dot + model list). Ollama base URL input, model selector from probe response.

**Commands:** `getInferenceConfig`, `setInferenceConfig`, `testConnection`, `checkLocalServices`, `getLocalModelConfig`, `setLocalModelConfig`

## Section 2: AppearanceSection

6 theme GlassBubbleButtons in 3x2 grid: Light, Dark, OLED, Cosmic, Sunny, Sunset. Active gets highlighted state. System toggle follows OS `prefers-color-scheme`.

**Persistence:** `useTheme()` hook — localStorage only, no backend.

## Section 3: SOARSection

Switches: Master enable, contradiction detection, verbose logging. Slider/buttons: max iterations (1-5).

**Persistence:** localStorage via Zustand ControlsSlice (interim — swap for `invoke()` when backend SOAR commands exist).

## Section 4: DataSection

**Cost tracking:** Today's spend, provider breakdown, daily budget input, reset button. Commands: `getCostSummary`, `setDailyBudget`, `resetCostTracker`.

**Vault:** Path display, change folder (Tauri dialog), Import All, Export All. Commands: `getVaultPath`, `setVaultPath`, `importVault`, `exportAll`.

**Danger zone:** Reset All Settings (AlertDialog confirmation). App version via `getAppInfo`.

## Persistence Model

| Setting | Where | Why |
|---|---|---|
| Inference config | Backend SQLite | Rust pipeline needs it |
| Local model config | Backend SQLite | Rust calls Ollama/Foundry |
| Cost tracking | Backend SQLite | Rust tracks per-call |
| Theme | localStorage | Purely CSS |
| SOAR toggles | localStorage | No backend commands yet |
| Vault path | Backend SQLite | Rust does file I/O |

## Components Used (all existing)

Switch, Input, Button, GlassBubbleButton, AlertDialog, Slider, PageShell, Section, GlassPanel, useTheme, useIsDark, usePFCStore (InferenceSlice, ControlsSlice)
