use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SpringState {
    pub value: f64,
    pub velocity: f64,
    pub target: f64,
}

#[wasm_bindgen]
pub struct SpringConfig {
    pub stiffness: f64,
    pub damping: f64,
    pub mass: f64,
}

#[wasm_bindgen]
pub struct SpringEngine {
    springs: HashMap<String, SpringState>,
    configs: HashMap<String, SpringConfig>,
}

impl Default for SpringEngine {
    fn default() -> Self { Self::new() }
}

#[wasm_bindgen]
impl SpringEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            springs: HashMap::new(),
            configs: HashMap::new(),
        }
    }

    #[wasm_bindgen]
    pub fn register_spring(&mut self, id: String, initial_val: f64, stiffness: f64, damping: f64, mass: f64) {
        self.springs.insert(id.clone(), SpringState {
            value: initial_val,
            velocity: 0.0,
            target: initial_val,
        });
        self.configs.insert(id, SpringConfig {
            stiffness,
            damping,
            mass,
        });
    }

    #[wasm_bindgen]
    pub fn unregister_spring(&mut self, id: String) {
        self.springs.remove(&id);
        self.configs.remove(&id);
    }

    #[wasm_bindgen]
    pub fn set_target(&mut self, id: String, target: f64) {
        if let Some(state) = self.springs.get_mut(&id) {
            state.target = target;
        }
    }

    #[wasm_bindgen]
    pub fn set_value(&mut self, id: String, value: f64) {
        if let Some(state) = self.springs.get_mut(&id) {
            state.value = value;
            state.target = value;
            state.velocity = 0.0;
        }
    }

    #[wasm_bindgen]
    pub fn tick(&mut self, dt_ms: f64) {
        // Prevent complete blowout if devtools are opened
        let dt = dt_ms.min(100.0) / 1000.0;
        if dt <= 0.0 {
            return;
        }

        // Fast forward large ticks by running multiple internal steps to preserve stability
        let max_dt = 1.0 / 60.0;
        let mut steps = (dt / max_dt).ceil() as i32;
        if steps == 0 { steps = 1; }
        let internal_dt = dt / (steps as f64);

        for _ in 0..steps {
            for (id, state) in self.springs.iter_mut() {
                if let Some(config) = self.configs.get(id) {
                    let force = -config.stiffness * (state.value - state.target);
                    let damping_force = -config.damping * state.velocity;
                    let acceleration = (force + damping_force) / config.mass;

                    state.velocity += acceleration * internal_dt;
                    state.value += state.velocity * internal_dt;

                    // Rest threshold logic (snap exactly to target when close enough)
                    if (state.velocity.abs() < 0.01) && (state.value - state.target).abs() < 0.01 {
                        state.value = state.target;
                        state.velocity = 0.0;
                    }
                }
            }
        }
    }

    #[wasm_bindgen]
    pub fn get_value(&self, id: String) -> f64 {
        self.springs.get(&id).map(|s| s.value).unwrap_or(0.0)
    }

    #[wasm_bindgen]
    pub fn is_resting(&self, id: String) -> bool {
        self.springs.get(&id).map(|s| s.velocity == 0.0 && s.value == s.target).unwrap_or(true)
    }
}
