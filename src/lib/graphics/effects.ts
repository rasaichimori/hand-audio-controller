/**
 * Visual Effects Module for PixiJS
 */

import { Graphics } from "pixi.js";

/**
 * Draw a pulsing circle using PixiJS Graphics
 */
export const drawPulsingCircle = (
  graphics: Graphics,
  x: number,
  y: number,
  baseRadius: number,
  phase: number,
  color: number,
  pulseAmount: number = 0.3
): void => {
  const pulse = Math.sin(phase) * pulseAmount;
  const radius = baseRadius * (1 + pulse);

  // Outer ring
  graphics.circle(x, y, radius + 4);
  graphics.stroke({ width: 2, color, alpha: 0.4 });

  // Solid center
  graphics.circle(x, y, radius);
  graphics.fill({ color });
};

/**
 * Draw a glowing line using PixiJS Graphics
 */
export const drawGlowingLine = (
  graphics: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number,
  width: number = 2,
  glowIntensity: number = 0.3
): void => {
  // Draw glow (thicker, semi-transparent line behind)
  graphics.moveTo(x1, y1);
  graphics.lineTo(x2, y2);
  graphics.stroke({ width: width + 4, color, alpha: glowIntensity });

  // Draw main line
  graphics.moveTo(x1, y1);
  graphics.lineTo(x2, y2);
  graphics.stroke({ width, color });
};

/**
 * Draw a ripple effect (expanding rings)
 */
export const drawRipple = (
  graphics: Graphics,
  x: number,
  y: number,
  progress: number, // 0 to 1
  maxRadius: number,
  color: number
): void => {
  const radius = progress * maxRadius;
  const alpha = 1 - progress;

  graphics.circle(x, y, radius);
  graphics.stroke({ width: 2, color, alpha });
};

/**
 * Draw a particle burst effect
 */
export const drawParticleBurst = (
  graphics: Graphics,
  x: number,
  y: number,
  progress: number, // 0 to 1
  particleCount: number,
  maxDistance: number,
  color: number
): void => {
  const angleStep = (Math.PI * 2) / particleCount;
  const distance = progress * maxDistance;
  const size = 3 * (1 - progress);
  const alpha = 1 - progress;

  for (let i = 0; i < particleCount; i++) {
    const angle = i * angleStep;
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance;

    graphics.circle(px, py, size);
    graphics.fill({ color, alpha });
  }
};

/**
 * Draw an arc indicator (like a gauge)
 */
export const drawArcIndicator = (
  graphics: Graphics,
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  color: number,
  width: number = 4,
  alpha: number = 1
): void => {
  graphics.arc(x, y, radius, startAngle, endAngle);
  graphics.stroke({ width, color, alpha });
};

/**
 * Convert hex string to number for PixiJS
 */
export const hexStringToNumber = (hex: string): number => {
  const cleanHex = hex.replace("#", "");
  return parseInt(cleanHex, 16);
};

/**
 * Interpolate between two colors
 */
export const lerpColor = (
  color1: number,
  color2: number,
  t: number
): number => {
  const r1 = (color1 >> 16) & 0xff;
  const g1 = (color1 >> 8) & 0xff;
  const b1 = color1 & 0xff;

  const r2 = (color2 >> 16) & 0xff;
  const g2 = (color2 >> 8) & 0xff;
  const b2 = color2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return (r << 16) | (g << 8) | b;
};
