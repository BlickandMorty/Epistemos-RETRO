/**
 * Physics Position Store — ref-based, NOT reactive.
 *
 * Receives 90Hz physics-frame events from the Rust backend and stores
 * the latest node positions. Components that need positions should poll
 * this store via requestAnimationFrame, NOT subscribe to it.
 *
 * This avoids pumping 90Hz updates through Zustand → React re-render.
 */

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface FpsCameraState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
  proximityNode: { node_id: string; distance: number } | null;
  stabilization: string;
}

let _positions: NodePosition[] = [];
let _settled = true;
let _frameCount = 0;
let _fpsCamera: FpsCameraState | null = null;

export function updateNodePositions(positions: NodePosition[], settled: boolean) {
  _positions = positions;
  _settled = settled;
  _frameCount++;
}

export function updateFpsCamera(camera: FpsCameraState) {
  _fpsCamera = camera;
}

export function getNodePositions(): NodePosition[] {
  return _positions;
}

export function isPhysicsSettled(): boolean {
  return _settled;
}

export function getPhysicsFrameCount(): number {
  return _frameCount;
}

export function getFpsCamera(): FpsCameraState | null {
  return _fpsCamera;
}
