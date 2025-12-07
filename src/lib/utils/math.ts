/**
 * Math Utilities
 * 
 * Common math functions used throughout the application.
 */

/**
 * Clamp a value between min and max
 */
export const clamp = (value: number, min: number, max: number): number => 
	Math.max(min, Math.min(max, value));

/**
 * Linear interpolation between two values
 */
export const lerp = (a: number, b: number, t: number): number => 
	a + (b - a) * t;

/**
 * Map a value from one range to another
 */
export const mapRange = (
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number
): number => {
	const normalized = (value - inMin) / (inMax - inMin);
	return outMin + normalized * (outMax - outMin);
};

/**
 * Map a value with clamping
 */
export const mapRangeClamped = (
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number
): number => {
	const mapped = mapRange(value, inMin, inMax, outMin, outMax);
	return clamp(mapped, Math.min(outMin, outMax), Math.max(outMin, outMax));
};

/**
 * Convert degrees to radians
 */
export const degToRad = (degrees: number): number => 
	degrees * (Math.PI / 180);

/**
 * Convert radians to degrees
 */
export const radToDeg = (radians: number): number => 
	radians * (180 / Math.PI);

/**
 * Calculate distance between two 2D points
 */
export const distance2D = (x1: number, y1: number, x2: number, y2: number): number =>
	Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

/**
 * Calculate distance between two 3D points
 */
export const distance3D = (
	x1: number, y1: number, z1: number,
	x2: number, y2: number, z2: number
): number => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);

/**
 * Smooth step function (for easing)
 */
export const smoothStep = (edge0: number, edge1: number, x: number): number => {
	const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
	return t * t * (3 - 2 * t);
};

/**
 * Smoother step function (Ken Perlin's improved version)
 */
export const smootherStep = (edge0: number, edge1: number, x: number): number => {
	const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
	return t * t * t * (t * (t * 6 - 15) + 10);
};

/**
 * Round to specified decimal places
 */
export const roundTo = (value: number, decimals: number): number => {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
};

/**
 * Check if two numbers are approximately equal
 */
export const approxEqual = (a: number, b: number, epsilon: number = 0.0001): boolean =>
	Math.abs(a - b) < epsilon;

