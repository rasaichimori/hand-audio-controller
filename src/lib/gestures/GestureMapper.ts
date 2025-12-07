/**
 * GestureMapper Module
 * 
 * Maps hand gesture values to audio parameters.
 * Provides a modular system for defining and processing gesture-to-parameter mappings.
 * 
 * The mapper handles:
 * - Extracting gesture values from hand landmarks
 * - Applying smoothing filters
 * - Mapping to target ranges with optional curves
 * - Calling the audio controller with final values
 */

import type { HandTrackingResult, HandResult, Landmark, Handedness } from '../types/hand.js';
import type { GestureMapping, GestureInput, MappingState, MappingCurve, SmoothingConfig } from '../types/mapping.js';
import { LandmarkIndex } from '../types/hand.js';
import { createFilter, type Filter } from './filters.js';
import {
	getPinchDistance,
	getHandOpenness,
	getFingerCurl,
	getHandRotation,
	getPalmFacing,
	getFingerSpread
} from '../hand-tracking/landmarkUtils.js';

/**
 * Gesture Mapper Class
 */
export class GestureMapper {
	private mappings: Map<string, GestureMapping> = new Map();
	private filters: Map<string, Filter> = new Map();
	private states: Map<string, MappingState> = new Map();
	private previousLandmarks: Map<string, Landmark[]> = new Map();
	private previousTimestamp: number = 0;
	private onParameterChange: ((deviceId: string, paramName: string, value: number) => void) | null = null;

	constructor() {}

	/**
	 * Set the callback for parameter changes
	 */
	setParameterCallback(callback: (deviceId: string, paramName: string, value: number) => void): void {
		this.onParameterChange = callback;
	}

	/**
	 * Add a new mapping
	 */
	addMapping(mapping: GestureMapping): void {
		this.mappings.set(mapping.id, mapping);
		this.filters.set(mapping.id, this.createFilterForMapping(mapping.smoothing));
		this.states.set(mapping.id, {
			rawValue: 0,
			smoothedValue: 0,
			outputValue: 0,
			lastUpdate: 0
		});
	}

	/**
	 * Remove a mapping
	 */
	removeMapping(id: string): void {
		this.mappings.delete(id);
		this.filters.delete(id);
		this.states.delete(id);
	}

	/**
	 * Update an existing mapping
	 */
	updateMapping(id: string, updates: Partial<GestureMapping>): void {
		const mapping = this.mappings.get(id);
		if (!mapping) return;

		const updated = { ...mapping, ...updates };
		this.mappings.set(id, updated);

		// Recreate filter if smoothing changed
		if (updates.smoothing) {
			this.filters.set(id, this.createFilterForMapping(updated.smoothing));
		}
	}

	/**
	 * Enable/disable a mapping
	 */
	setMappingEnabled(id: string, enabled: boolean): void {
		const mapping = this.mappings.get(id);
		if (mapping) {
			mapping.enabled = enabled;
		}
	}

	/**
	 * Process a hand tracking result and update all mappings
	 */
	process(result: HandTrackingResult): Map<string, MappingState> {
		const deltaTime = result.timestamp - this.previousTimestamp;
		this.previousTimestamp = result.timestamp;

		for (const [id, mapping] of this.mappings) {
			if (!mapping.enabled) continue;

			// Find the appropriate hand
			const hand = this.findHand(result.hands, mapping.input.hand);
			if (!hand) continue;

			// Extract raw gesture value
			const rawValue = this.extractGestureValue(
				hand.landmarks,
				mapping.input,
				hand.handedness,
				deltaTime
			);

			// Apply smoothing filter
			const filter = this.filters.get(id);
			const smoothedValue = filter ? filter.filter(rawValue, result.timestamp / 1000) : rawValue;

			// Apply mapping curve and output range
			const outputValue = this.applyMapping(smoothedValue, mapping);

			// Update state
			const state: MappingState = {
				rawValue,
				smoothedValue,
				outputValue,
				lastUpdate: result.timestamp
			};
			this.states.set(id, state);

			// Call parameter change callback
			if (this.onParameterChange) {
				this.onParameterChange(
					mapping.output.deviceId,
					mapping.output.parameterName,
					outputValue
				);
			}

			// Store landmarks for velocity calculations
			const handKey = hand.handedness;
			this.previousLandmarks.set(handKey, [...hand.landmarks]);
		}

		return this.states;
	}

	/**
	 * Get current state for a mapping
	 */
	getState(id: string): MappingState | undefined {
		return this.states.get(id);
	}

	/**
	 * Get all current states
	 */
	getAllStates(): Map<string, MappingState> {
		return new Map(this.states);
	}

	/**
	 * Get all mappings
	 */
	getMappings(): GestureMapping[] {
		return Array.from(this.mappings.values());
	}

	/**
	 * Reset all filters and states
	 */
	reset(): void {
		for (const filter of this.filters.values()) {
			filter.reset();
		}
		for (const [id, state] of this.states) {
			this.states.set(id, {
				rawValue: 0,
				smoothedValue: 0,
				outputValue: 0,
				lastUpdate: 0
			});
		}
		this.previousLandmarks.clear();
		this.previousTimestamp = 0;
	}

	/**
	 * Find the appropriate hand based on mapping configuration
	 */
	private findHand(hands: HandResult[], target: Handedness | 'any'): HandResult | undefined {
		if (target === 'any') {
			return hands[0];
		}
		return hands.find(h => h.handedness === target);
	}

	/**
	 * Extract gesture value from landmarks based on gesture type
	 */
	private extractGestureValue(
		landmarks: Landmark[],
		input: GestureInput,
		handedness: Handedness,
		deltaTime: number
	): number {
		switch (input.type) {
			case 'pinch_distance':
				return getPinchDistance(landmarks, input.finger ?? LandmarkIndex.INDEX_TIP);

			case 'hand_openness':
				return getHandOpenness(landmarks);

			case 'finger_curl': {
				const fingerMap: Record<number, 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'> = {
					[LandmarkIndex.THUMB_TIP]: 'thumb',
					[LandmarkIndex.INDEX_TIP]: 'index',
					[LandmarkIndex.MIDDLE_TIP]: 'middle',
					[LandmarkIndex.RING_TIP]: 'ring',
					[LandmarkIndex.PINKY_TIP]: 'pinky'
				};
				const finger = fingerMap[input.finger ?? LandmarkIndex.INDEX_TIP] ?? 'index';
				return getFingerCurl(landmarks, finger);
			}

			case 'hand_rotation':
				return getHandRotation(landmarks);

			case 'wrist_position_x':
				return landmarks[LandmarkIndex.WRIST].x;

			case 'wrist_position_y':
				return landmarks[LandmarkIndex.WRIST].y;

			case 'wrist_depth':
				return landmarks[LandmarkIndex.WRIST].z;

			case 'finger_spread':
				return getFingerSpread(landmarks);

			case 'palm_facing':
				return getPalmFacing(landmarks);

			case 'velocity_x':
			case 'velocity_y': {
				const prevLandmarks = this.previousLandmarks.get(handedness);
				if (!prevLandmarks || deltaTime === 0) return 0;
				const curr = landmarks[LandmarkIndex.WRIST];
				const prev = prevLandmarks[LandmarkIndex.WRIST];
				const velocity = input.type === 'velocity_x'
					? (curr.x - prev.x) / deltaTime
					: (curr.y - prev.y) / deltaTime;
				return Math.abs(velocity);
			}

			case 'custom':
				if (input.customExtractor) {
					return input.customExtractor(landmarks);
				}
				return 0;

			default:
				return 0;
		}
	}

	/**
	 * Apply mapping curve and output range transformation
	 */
	private applyMapping(value: number, mapping: GestureMapping): number {
		const { input, output } = mapping;

		// Normalize input to 0-1 range
		const [inMin, inMax] = input.inputRange;
		let normalized = (value - inMin) / (inMax - inMin);
		normalized = Math.max(0, Math.min(1, normalized));

		// Apply curve
		const curved = this.applyCurve(normalized, input.curve ?? 'linear');

		// Map to output range
		const [outMin, outMax] = output.outputRange;
		let outputValue = outMin + curved * (outMax - outMin);

		// Apply inversion if specified
		if (output.invert) {
			outputValue = outMax - (outputValue - outMin);
		}

		return outputValue;
	}

	/**
	 * Apply a mapping curve to a normalized value
	 */
	private applyCurve(value: number, curve: MappingCurve): number {
		switch (curve) {
			case 'linear':
				return value;

			case 'exponential':
				return value * value;

			case 'logarithmic':
				return Math.log1p(value * (Math.E - 1)) / Math.log(Math.E);

			case 'ease-in':
				return value * value * value;

			case 'ease-out':
				return 1 - Math.pow(1 - value, 3);

			case 'ease-in-out':
				return value < 0.5
					? 4 * value * value * value
					: 1 - Math.pow(-2 * value + 2, 3) / 2;

			case 'smooth-step':
				return value * value * (3 - 2 * value);

			default:
				return value;
		}
	}

	/**
	 * Create a filter based on smoothing configuration
	 */
	private createFilterForMapping(config: SmoothingConfig): Filter {
		return createFilter({
			type: config.type,
			factor: config.factor,
			minCutoff: config.minCutoff,
			beta: config.beta,
			dCutoff: config.dCutoff
		});
	}
}

/**
 * Singleton instance
 */
let globalMapper: GestureMapper | null = null;

export const getGestureMapper = (): GestureMapper => {
	if (!globalMapper) {
		globalMapper = new GestureMapper();
	}
	return globalMapper;
};

export const destroyGestureMapper = (): void => {
	if (globalMapper) {
		globalMapper.reset();
		globalMapper = null;
	}
};

