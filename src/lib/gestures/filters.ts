/**
 * Smoothing Filters Module
 * 
 * Implements various smoothing filters to reduce jitter in hand tracking data.
 * The 1€ filter is particularly effective for this use case as it adapts
 * its smoothing based on signal velocity.
 */

/**
 * Simple low-pass filter
 * Good for basic smoothing, but can introduce lag
 */
export class LowPassFilter {
	private value: number | null = null;
	private factor: number;

	/**
	 * @param factor - Smoothing factor (0-1). Higher = more smoothing, more lag
	 */
	constructor(factor: number = 0.5) {
		this.factor = Math.max(0, Math.min(1, factor));
	}

	/**
	 * Filter a new value
	 */
	filter(newValue: number): number {
		if (this.value === null) {
			this.value = newValue;
		} else {
			this.value = this.value * this.factor + newValue * (1 - this.factor);
		}
		return this.value;
	}

	/**
	 * Reset the filter state
	 */
	reset(): void {
		this.value = null;
	}

	/**
	 * Update the smoothing factor
	 */
	setFactor(factor: number): void {
		this.factor = Math.max(0, Math.min(1, factor));
	}

	/**
	 * Get current value
	 */
	get currentValue(): number | null {
		return this.value;
	}
}

/**
 * Exponential moving average filter
 * Similar to low-pass but with different response characteristics
 */
export class ExponentialFilter {
	private value: number | null = null;
	private alpha: number;

	/**
	 * @param alpha - Smoothing alpha (0-1). Lower = more smoothing
	 */
	constructor(alpha: number = 0.3) {
		this.alpha = Math.max(0.01, Math.min(1, alpha));
	}

	filter(newValue: number): number {
		if (this.value === null) {
			this.value = newValue;
		} else {
			this.value = this.alpha * newValue + (1 - this.alpha) * this.value;
		}
		return this.value;
	}

	reset(): void {
		this.value = null;
	}

	setAlpha(alpha: number): void {
		this.alpha = Math.max(0.01, Math.min(1, alpha));
	}
}

/**
 * One Euro Filter
 * 
 * Adaptive low-pass filter that reduces jitter while maintaining responsiveness.
 * Based on the paper: "1€ Filter: A Simple Speed-based Low-pass Filter for
 * Noisy Input in Interactive Systems" by Casiez et al.
 * 
 * This filter is ideal for hand tracking as it:
 * - Smooths heavily when the hand is still (reduces jitter)
 * - Responds quickly when the hand moves (reduces lag)
 */
export class OneEuroFilter {
	private minCutoff: number;
	private beta: number;
	private dCutoff: number;
	private xFilter: LowPassFilterInternal;
	private dxFilter: LowPassFilterInternal;
	private lastTime: number | null = null;
	private lastValue: number | null = null;

	/**
	 * @param minCutoff - Minimum cutoff frequency. Lower = more smoothing when stationary
	 * @param beta - Cutoff slope. Higher = faster response to movement
	 * @param dCutoff - Derivative cutoff. Affects derivative smoothing
	 */
	constructor(minCutoff: number = 1.0, beta: number = 0.007, dCutoff: number = 1.0) {
		this.minCutoff = minCutoff;
		this.beta = beta;
		this.dCutoff = dCutoff;
		this.xFilter = new LowPassFilterInternal(this.alpha(minCutoff, 1 / 60));
		this.dxFilter = new LowPassFilterInternal(this.alpha(dCutoff, 1 / 60));
	}

	/**
	 * Calculate alpha from cutoff frequency
	 */
	private alpha(cutoff: number, dt: number): number {
		const tau = 1.0 / (2 * Math.PI * cutoff);
		return 1.0 / (1.0 + tau / dt);
	}

	/**
	 * Filter a new value
	 * @param value - The new value to filter
	 * @param timestamp - Current timestamp in seconds (optional, uses Date.now() if not provided)
	 */
	filter(value: number, timestamp?: number): number {
		const now = timestamp ?? Date.now() / 1000;

		if (this.lastTime === null || this.lastValue === null) {
			this.lastTime = now;
			this.lastValue = value;
			this.xFilter.setAlpha(this.alpha(this.minCutoff, 1 / 60));
			return this.xFilter.filter(value);
		}

		const dt = Math.max(now - this.lastTime, 1e-6);
		this.lastTime = now;

		// Calculate derivative (velocity)
		const dx = (value - this.lastValue) / dt;
		this.lastValue = value;

		// Smooth the derivative
		this.dxFilter.setAlpha(this.alpha(this.dCutoff, dt));
		const smoothedDx = this.dxFilter.filter(dx);

		// Calculate adaptive cutoff
		const cutoff = this.minCutoff + this.beta * Math.abs(smoothedDx);

		// Filter the value
		this.xFilter.setAlpha(this.alpha(cutoff, dt));
		return this.xFilter.filter(value);
	}

	/**
	 * Reset the filter state
	 */
	reset(): void {
		this.lastTime = null;
		this.lastValue = null;
		this.xFilter.reset();
		this.dxFilter.reset();
	}

	/**
	 * Update filter parameters
	 */
	updateParams(minCutoff?: number, beta?: number, dCutoff?: number): void {
		if (minCutoff !== undefined) this.minCutoff = minCutoff;
		if (beta !== undefined) this.beta = beta;
		if (dCutoff !== undefined) this.dCutoff = dCutoff;
	}
}

/**
 * Internal low-pass filter for One Euro Filter
 */
class LowPassFilterInternal {
	private y: number | null = null;
	private alpha: number;

	constructor(alpha: number) {
		this.alpha = alpha;
	}

	filter(x: number): number {
		if (this.y === null) {
			this.y = x;
		} else {
			this.y = this.alpha * x + (1 - this.alpha) * this.y;
		}
		return this.y;
	}

	reset(): void {
		this.y = null;
	}

	setAlpha(alpha: number): void {
		this.alpha = alpha;
	}
}

/**
 * Moving average filter
 * Simple but effective for reducing noise
 */
export class MovingAverageFilter {
	private window: number[];
	private size: number;
	private sum: number = 0;

	constructor(windowSize: number = 5) {
		this.size = Math.max(1, windowSize);
		this.window = [];
	}

	filter(value: number): number {
		this.window.push(value);
		this.sum += value;

		if (this.window.length > this.size) {
			this.sum -= this.window.shift()!;
		}

		return this.sum / this.window.length;
	}

	reset(): void {
		this.window = [];
		this.sum = 0;
	}

	setWindowSize(size: number): void {
		this.size = Math.max(1, size);
		while (this.window.length > this.size) {
			this.sum -= this.window.shift()!;
		}
	}
}

/**
 * Factory function to create a filter based on type
 */
export type FilterType = 'none' | 'low-pass' | 'one-euro' | 'exponential' | 'moving-average';

export interface FilterConfig {
	type: FilterType;
	factor?: number;        // For low-pass
	alpha?: number;         // For exponential
	minCutoff?: number;     // For one-euro
	beta?: number;          // For one-euro
	dCutoff?: number;       // For one-euro
	windowSize?: number;    // For moving-average
}

export interface Filter {
	filter(value: number, timestamp?: number): number;
	reset(): void;
}

export const createFilter = (config: FilterConfig): Filter => {
	switch (config.type) {
		case 'low-pass':
			return new LowPassFilter(config.factor ?? 0.5);
		case 'exponential':
			return new ExponentialFilter(config.alpha ?? 0.3);
		case 'one-euro':
			return new OneEuroFilter(
				config.minCutoff ?? 1.0,
				config.beta ?? 0.007,
				config.dCutoff ?? 1.0
			);
		case 'moving-average':
			return new MovingAverageFilter(config.windowSize ?? 5);
		case 'none':
		default:
			// Pass-through filter
			return {
				filter: (value: number) => value,
				reset: () => {}
			};
	}
};

