#[cfg(not(target_arch = "wasm32"))]
pub mod fps_mode;
#[cfg(not(target_arch = "wasm32"))]
pub mod fps_player;
#[cfg(not(target_arch = "wasm32"))]
pub mod world;
pub mod spring;

#[cfg(test)]
mod tests;
