/**
 * Visual Effects Module
 */

/**
 * Draw a pulsing circle
 */
export const drawPulsingCircle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseRadius: number,
  phase: number,
  color: string,
  pulseAmount: number = 0.3
): void => {
  const pulse = Math.sin(phase) * pulseAmount;
  const radius = baseRadius * (1 + pulse);

  // Outer ring
  ctx.beginPath();
  ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
  ctx.strokeStyle = colorWithAlpha(color, 0.4);
  ctx.lineWidth = 2;
  ctx.stroke();

  // Solid center
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
};

/**
 * Helper to add alpha to hex color
 */
const colorWithAlpha = (hex: string, alpha: number): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(255, 255, 255, ${alpha})`;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
