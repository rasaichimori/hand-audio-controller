/**
 * Gesture Mapping Type Definitions
 * 
 * These types define how hand gestures are mapped to audio parameters.
 * The system is designed to be modular and extensible.
 */

import type { Landmark, LandmarkIndex, Handedness } from './hand.js';

/**
 * Supported gesture types that can be detected
 */
export type GestureType =
	| 'pinch_distance'      // Distance between thumb and any fingertip
	| 'finger_curl'         // How curled a finger is (0 = extended, 1 = fully curled)
	| 'hand_openness'       // Overall hand openness (0 = fist, 1 = fully open)
	| 'hand_rotation'       // Rotation angle of the hand
	| 'wrist_position_x'    // Horizontal position of wrist
	| 'wrist_position_y'    // Vertical position of wrist
	| 'wrist_depth'         // Z-depth of wrist (distance from camera)
	| 'finger_spread'       // Angle between fingers
	| 'palm_facing'         // Whether palm faces camera (0 = away, 1 = towards)
	| 'velocity_x'          // Horizontal movement speed
	| 'velocity_y'          // Vertical movement speed
	| 'custom';             // Custom gesture function

/**
 * Configuration for a specific gesture input
 */
export interface GestureInput {
	type: GestureType;
	
	/**
	 * Which hand to track (or 'any' for first available)
	 */
	hand: Handedness | 'any';
	
	/**
	 * For pinch gestures, which finger to use with thumb
	 */
	finger?: LandmarkIndex;
	
	/**
	 * Custom extraction function for 'custom' type
	 */
	customExtractor?: (landmarks: Landmark[]) => number;
	
	/**
	 * Input value range [min, max] - values outside are clamped
	 */
	inputRange: [number, number];
	
	/**
	 * Optional curve for non-linear mapping
	 * 'linear' | 'exponential' | 'logarithmic' | 'ease-in' | 'ease-out' | 'ease-in-out'
	 */
	curve?: MappingCurve;
}

/**
 * Mapping curve types for non-linear transformations
 */
export type MappingCurve =
	| 'linear'
	| 'exponential'
	| 'logarithmic'
	| 'ease-in'
	| 'ease-out'
	| 'ease-in-out'
	| 'smooth-step';

/**
 * Audio parameter output configuration
 */
export interface ParameterOutput {
	/**
	 * Audiotool device ID
	 */
	deviceId: string;
	
	/**
	 * Parameter name on the device
	 */
	parameterName: string;
	
	/**
	 * Output value range [min, max]
	 */
	outputRange: [number, number];
	
	/**
	 * Whether to invert the mapping
	 */
	invert?: boolean;
}

/**
 * Smoothing configuration to reduce jitter
 */
export interface SmoothingConfig {
	/**
	 * Type of smoothing filter
	 */
	type: 'none' | 'low-pass' | 'one-euro' | 'exponential';
	
	/**
	 * Smoothing factor (0-1, higher = more smoothing)
	 */
	factor?: number;
	
	/**
	 * One Euro filter specific: minimum cutoff frequency
	 */
	minCutoff?: number;
	
	/**
	 * One Euro filter specific: cutoff slope
	 */
	beta?: number;
	
	/**
	 * One Euro filter specific: derivative cutoff
	 */
	dCutoff?: number;
}

/**
 * Complete gesture-to-parameter mapping definition
 */
export interface GestureMapping {
	/**
	 * Unique identifier for this mapping
	 */
	id: string;
	
	/**
	 * Human-readable name
	 */
	name: string;
	
	/**
	 * Whether this mapping is active
	 */
	enabled: boolean;
	
	/**
	 * Gesture input configuration
	 */
	input: GestureInput;
	
	/**
	 * Audio parameter output configuration
	 */
	output: ParameterOutput;
	
	/**
	 * Smoothing configuration
	 */
	smoothing: SmoothingConfig;
}

/**
 * Current state of a mapping (runtime values)
 */
export interface MappingState {
	rawValue: number;
	smoothedValue: number;
	outputValue: number;
	lastUpdate: number;
}

/**
 * Collection of mappings with their current states
 */
export interface MappingSet {
	mappings: GestureMapping[];
	states: Map<string, MappingState>;
}

/**
 * Default smoothing configuration
 */
export const DEFAULT_SMOOTHING: SmoothingConfig = {
	type: 'one-euro',
	minCutoff: 1.0,
	beta: 0.007,
	dCutoff: 1.0
};

/**
 * Factory function to create a new mapping
 */
export const createMapping = (
	id: string,
	name: string,
	input: Partial<GestureInput> & { type: GestureType },
	output: ParameterOutput,
	smoothing: Partial<SmoothingConfig> = {}
): GestureMapping => ({
	id,
	name,
	enabled: true,
	input: {
		hand: 'any',
		inputRange: [0, 1],
		curve: 'linear',
		...input
	},
	output,
	smoothing: { ...DEFAULT_SMOOTHING, ...smoothing }
});

