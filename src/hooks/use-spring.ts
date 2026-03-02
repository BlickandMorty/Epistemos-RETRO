import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { getSpringEngine } from '@/lib/wasm-loader';

export interface SpringConfig {
    stiffness?: number;
    damping?: number;
    mass?: number;
}

export const physicsSpring = {
    default: { stiffness: 300, damping: 30, mass: 1 },
    bouncy: { stiffness: 400, damping: 20, mass: 1 },
    snappy: { stiffness: 500, damping: 35, mass: 1 },
    slow: { stiffness: 100, damping: 20, mass: 1 },
    chatEnter: { stiffness: 200, damping: 25, mass: 1 },
    chatPanel: { stiffness: 350, damping: 30, mass: 1 },
};

/**
 * Unique ID generator for springs within the WASM engine.
 */
let nextSpringId = 0;

/**
 * useSpring returns an opaque SpringHandle that allows setting target values
 * and reading current interpolated value. You should bind this directly
 * to a DOM element ref's style object inside requestAnimationFrame to avoid
 * React render lag.
 *
 * @param initialValue Start value of the spring
 * @param config Optional physics parameters
 * @returns Spring handle linked to the WASM engine.
 */
export function useSpring(initialValue: number, config: SpringConfig = physicsSpring.default) {
    // Use a string ID to register inside the WASM hashmap
    const idRef = useRef(`spring_${nextSpringId++}`);
    const id = idRef.current;

    const [engine] = useState(() => {
        try {
            return getSpringEngine();
        } catch {
            return null;
        }
    });

    // Register the spring when the WASM module becomes available.
    useLayoutEffect(() => {
        if (!engine) return;
        engine.register_spring(
            id,
            initialValue,
            config.stiffness ?? physicsSpring.default.stiffness,
            config.damping ?? physicsSpring.default.damping,
            config.mass ?? physicsSpring.default.mass
        );
        return () => {
            engine.unregister_spring(id);
        };
    }, [engine, id, initialValue, config.stiffness, config.damping, config.mass]);

    // Method to imperatively push a target
    const setTarget = useCallback((target: number) => {
        if (!engine) return;
        engine.set_target(id, target);
    }, [engine, id]);

    const setValue = useCallback((value: number) => {
        if (!engine) return;
        engine.set_value(id, value);
    }, [engine, id]);

    const get = useCallback((): number => {
        if (!engine) return initialValue;
        return engine.get_value(id);
    }, [engine, id, initialValue]);

    // Expose methods for components to interact with the solver
    return { setTarget, setValue, get, engineId: id };
}

/**
 * Global render loop that steps the WASM physics simulations and syncs
 * registered callback functions. This bypasses React reconciliation.
 */
const subscribers = new Set<(dt: number) => void>();
export let globalRafId: number | null = null;
let lastTime = 0;

function globalTick(time: number) {
    if (lastTime !== 0) {
        const dtMs = time - lastTime;
        try {
            const engine = getSpringEngine();
            engine.tick(dtMs);
            for (const sub of subscribers) {
                sub(dtMs);
            }
        } catch (e) {
            // WASM might not be loaded yet, skip frame
        }
    }
    lastTime = time;
    globalRafId = requestAnimationFrame(globalTick);
}

// Start the global engine ticker immediately (it silenty fails on tick until wasM loads).
if (typeof window !== 'undefined') {
    globalRafId = requestAnimationFrame(globalTick);
}

/**
 * Component hook to subscribe a callback per frame. Use this to sync the
 * useSpring() `.get()` output to an element's inline style directly.
 */
export function useSpringFrame(callback: (dt: number) => void) {
    useEffect(() => {
        subscribers.add(callback);
        return () => {
            subscribers.delete(callback);
        };
    }, [callback]);
}
