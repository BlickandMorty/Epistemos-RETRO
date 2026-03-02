import init, { type InitOutput, SpringEngine } from './ui-physics-wasm/ui_physics';

let wasmInitPromise: Promise<InitOutput> | null = null;
let springEngineInstance: SpringEngine | null = null;

/**
 * Ensures the WASM module is loaded and instantiated exactly once.
 */
export async function initWasm(): Promise<void> {
    if (springEngineInstance) return;
    if (!wasmInitPromise) {
        // Vite handles the ?init or static asset loading natively for `target: web`
        wasmInitPromise = init();
    }
    await wasmInitPromise;

    if (!springEngineInstance) {
        springEngineInstance = new SpringEngine();
    }
}

/**
 * Get the global SpringEngine singleton.
 * Throws if initWasm() hasn't completed yet.
 */
export function getSpringEngine(): SpringEngine {
    if (!springEngineInstance) {
        throw new Error('SpringEngine not initialized. Call initWasm() first.');
    }
    return springEngineInstance;
}
