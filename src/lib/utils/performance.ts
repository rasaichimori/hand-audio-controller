/**
 * Performance Monitoring Utilities
 * 
 * Tools for measuring and optimizing performance.
 */

/**
 * FPS Counter
 * Tracks frame rate over time
 */
export class FPSCounter {
	private frames: number = 0;
	private lastTime: number = performance.now();
	private fps: number = 0;
	private updateInterval: number;

	constructor(updateInterval: number = 1000) {
		this.updateInterval = updateInterval;
	}

	/**
	 * Call this every frame
	 * Returns current FPS (updated every interval)
	 */
	tick(): number {
		this.frames++;
		const now = performance.now();
		const elapsed = now - this.lastTime;

		if (elapsed >= this.updateInterval) {
			this.fps = Math.round((this.frames * 1000) / elapsed);
			this.frames = 0;
			this.lastTime = now;
		}

		return this.fps;
	}

	/**
	 * Get current FPS without ticking
	 */
	get currentFPS(): number {
		return this.fps;
	}

	/**
	 * Reset counter
	 */
	reset(): void {
		this.frames = 0;
		this.lastTime = performance.now();
		this.fps = 0;
	}
}

/**
 * Frame time tracker
 * Measures time between frames and detects drops
 */
export class FrameTimeTracker {
	private lastFrameTime: number = 0;
	private frameTimes: number[] = [];
	private maxSamples: number;

	constructor(maxSamples: number = 60) {
		this.maxSamples = maxSamples;
	}

	/**
	 * Call at the start of each frame
	 * Returns time since last frame in milliseconds
	 */
	startFrame(): number {
		const now = performance.now();
		const delta = this.lastFrameTime > 0 ? now - this.lastFrameTime : 16.67;
		this.lastFrameTime = now;

		this.frameTimes.push(delta);
		if (this.frameTimes.length > this.maxSamples) {
			this.frameTimes.shift();
		}

		return delta;
	}

	/**
	 * Get average frame time
	 */
	get averageFrameTime(): number {
		if (this.frameTimes.length === 0) return 16.67;
		return this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
	}

	/**
	 * Get max frame time (worst frame)
	 */
	get maxFrameTime(): number {
		if (this.frameTimes.length === 0) return 0;
		return Math.max(...this.frameTimes);
	}

	/**
	 * Get frame time variance (jitter indicator)
	 */
	get variance(): number {
		if (this.frameTimes.length < 2) return 0;
		const avg = this.averageFrameTime;
		const squaredDiffs = this.frameTimes.map(t => (t - avg) ** 2);
		return squaredDiffs.reduce((a, b) => a + b) / this.frameTimes.length;
	}

	/**
	 * Check if there are frame drops (>33ms = below 30fps)
	 */
	hasFrameDrops(threshold: number = 33): boolean {
		return this.frameTimes.some(t => t > threshold);
	}

	reset(): void {
		this.lastFrameTime = 0;
		this.frameTimes = [];
	}
}

/**
 * Performance profiler for timing code sections
 */
export class Profiler {
	private marks: Map<string, number> = new Map();
	private measurements: Map<string, number[]> = new Map();
	private maxSamples: number;

	constructor(maxSamples: number = 100) {
		this.maxSamples = maxSamples;
	}

	/**
	 * Start timing a section
	 */
	start(name: string): void {
		this.marks.set(name, performance.now());
	}

	/**
	 * End timing a section
	 * Returns the duration in milliseconds
	 */
	end(name: string): number {
		const startTime = this.marks.get(name);
		if (startTime === undefined) {
			console.warn(`Profiler: No start mark for "${name}"`);
			return 0;
		}

		const duration = performance.now() - startTime;
		this.marks.delete(name);

		// Store measurement
		if (!this.measurements.has(name)) {
			this.measurements.set(name, []);
		}
		const samples = this.measurements.get(name)!;
		samples.push(duration);
		if (samples.length > this.maxSamples) {
			samples.shift();
		}

		return duration;
	}

	/**
	 * Get average duration for a named section
	 */
	getAverage(name: string): number {
		const samples = this.measurements.get(name);
		if (!samples || samples.length === 0) return 0;
		return samples.reduce((a, b) => a + b) / samples.length;
	}

	/**
	 * Get all averages
	 */
	getAllAverages(): Map<string, number> {
		const result = new Map<string, number>();
		for (const [name, samples] of this.measurements) {
			if (samples.length > 0) {
				result.set(name, samples.reduce((a, b) => a + b) / samples.length);
			}
		}
		return result;
	}

	/**
	 * Clear all measurements
	 */
	clear(): void {
		this.marks.clear();
		this.measurements.clear();
	}

	/**
	 * Log all averages to console
	 */
	log(): void {
		console.group('Profiler Results');
		for (const [name, avg] of this.getAllAverages()) {
			console.log(`${name}: ${avg.toFixed(2)}ms`);
		}
		console.groupEnd();
	}
}

/**
 * Throttle function execution
 */
export const throttle = <T extends (...args: any[]) => any>(
	fn: T,
	limit: number
): ((...args: Parameters<T>) => void) => {
	let inThrottle = false;

	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			fn(...args);
			inThrottle = true;
			setTimeout(() => {
				inThrottle = false;
			}, limit);
		}
	};
};

/**
 * Debounce function execution
 */
export const debounce = <T extends (...args: any[]) => any>(
	fn: T,
	delay: number
): ((...args: Parameters<T>) => void) => {
	let timeoutId: ReturnType<typeof setTimeout>;

	return (...args: Parameters<T>) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			fn(...args);
		}, delay);
	};
};

