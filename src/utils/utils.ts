import { Vector2 } from "three";

export function clampValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function updatePointer(
  event: MouseEvent | PointerEvent | WheelEvent,
  pointerNDC: Vector2,
  canvas: HTMLCanvasElement,
) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  return true;
}
