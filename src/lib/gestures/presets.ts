/**
 * Gesture Mapping Presets
 * 
 * Pre-configured gesture-to-parameter mappings for common use cases.
 * These can be used as starting points or templates for custom mappings.
 */

import type { GestureMapping } from '../types/mapping.js';
import { createMapping } from '../types/mapping.js';
import { LandmarkIndex } from '../types/hand.js';

/**
 * Preset: Thumb-Index Pinch to Filter Cutoff
 * 
 * The distance between thumb and index finger controls the filter cutoff.
 * Pinching (close together) = low cutoff (darker sound)
 * Open (far apart) = high cutoff (brighter sound)
 */
export const PINCH_TO_FILTER_CUTOFF: GestureMapping = createMapping(
	'pinch-filter-cutoff',
	'Pinch → Filter Cutoff',
	{
		type: 'pinch_distance',
		hand: 'Right',
		finger: LandmarkIndex.INDEX_TIP,
		inputRange: [0.02, 0.15], // Pinch distance range (normalized)
		curve: 'smooth-step'
	},
	{
		deviceId: 'filter',
		parameterName: 'cutoff',
		outputRange: [0.1, 1.0]
	},
	{
		type: 'one-euro',
		minCutoff: 1.5,
		beta: 0.01
	}
);

/**
 * Preset: Wrist Y Position to Volume
 * 
 * Moving hand up/down controls the volume.
 * Hand up = louder
 * Hand down = quieter
 */
export const WRIST_Y_TO_VOLUME: GestureMapping = createMapping(
	'wrist-y-volume',
	'Hand Height → Volume',
	{
		type: 'wrist_position_y',
		hand: 'any',
		inputRange: [0.2, 0.8], // Screen position range
		curve: 'linear'
	},
	{
		deviceId: 'master',
		parameterName: 'gain',
		outputRange: [0.0, 1.0],
		invert: true // Higher position = lower y value
	},
	{
		type: 'one-euro',
		minCutoff: 0.5,
		beta: 0.005
	}
);

/**
 * Preset: Wrist Depth (Z) to Delay Mix
 * 
 * Moving hand towards/away from camera controls delay wet/dry mix.
 * Hand forward = more delay
 * Hand back = less delay
 */
export const DEPTH_TO_DELAY: GestureMapping = createMapping(
	'depth-delay-mix',
	'Hand Depth → Delay Mix',
	{
		type: 'wrist_depth',
		hand: 'Right',
		inputRange: [-0.1, 0.1], // Z-depth range
		curve: 'smooth-step'
	},
	{
		deviceId: 'delay',
		parameterName: 'mix',
		outputRange: [0.0, 0.8]
	},
	{
		type: 'one-euro',
		minCutoff: 1.0,
		beta: 0.008
	}
);

/**
 * Preset: Hand Rotation to Stereo Pan
 * 
 * Rotating the hand controls stereo panning.
 * Rotate left = pan left
 * Rotate right = pan right
 */
export const ROTATION_TO_PAN: GestureMapping = createMapping(
	'rotation-pan',
	'Hand Rotation → Pan',
	{
		type: 'hand_rotation',
		hand: 'Right',
		inputRange: [-Math.PI / 3, Math.PI / 3], // ±60 degrees
		curve: 'linear'
	},
	{
		deviceId: 'synth',
		parameterName: 'pan',
		outputRange: [0.0, 1.0]
	},
	{
		type: 'one-euro',
		minCutoff: 2.0,
		beta: 0.015
	}
);

/**
 * Preset: Hand Openness to Filter Resonance
 * 
 * Open/close hand to control filter resonance.
 * Fist = low resonance
 * Open hand = high resonance
 */
export const OPENNESS_TO_RESONANCE: GestureMapping = createMapping(
	'openness-resonance',
	'Hand Open → Resonance',
	{
		type: 'hand_openness',
		hand: 'Left',
		inputRange: [0.1, 0.4], // Openness range
		curve: 'exponential'
	},
	{
		deviceId: 'filter',
		parameterName: 'resonance',
		outputRange: [0.0, 0.9]
	},
	{
		type: 'one-euro',
		minCutoff: 1.0,
		beta: 0.01
	}
);

/**
 * Preset: Index Finger Curl to Synth Attack
 * 
 * Curl index finger to control synth attack time.
 * Extended = short attack (punchy)
 * Curled = long attack (swelling)
 */
export const FINGER_CURL_TO_ATTACK: GestureMapping = createMapping(
	'curl-attack',
	'Index Curl → Attack',
	{
		type: 'finger_curl',
		hand: 'Left',
		finger: LandmarkIndex.INDEX_TIP,
		inputRange: [0.2, 0.8],
		curve: 'smooth-step'
	},
	{
		deviceId: 'synth',
		parameterName: 'attack',
		outputRange: [0.01, 0.5]
	},
	{
		type: 'one-euro',
		minCutoff: 0.8,
		beta: 0.005
	}
);

/**
 * Preset: Wrist X Position to Synth Detune
 * 
 * Move hand left/right to detune the synth.
 * Center = no detune
 * Left/Right = more detune
 */
export const WRIST_X_TO_DETUNE: GestureMapping = createMapping(
	'wrist-x-detune',
	'Hand X → Detune',
	{
		type: 'wrist_position_x',
		hand: 'Right',
		inputRange: [0.2, 0.8],
		curve: 'linear'
	},
	{
		deviceId: 'synth',
		parameterName: 'detune',
		outputRange: [-50, 50]
	},
	{
		type: 'one-euro',
		minCutoff: 2.0,
		beta: 0.02
	}
);

/**
 * Preset: Thumb-Pinky Pinch to Delay Feedback
 * 
 * Pinch thumb and pinky to control delay feedback.
 * Good for creating ambient effects with larger hand gestures.
 */
export const PINKY_PINCH_TO_FEEDBACK: GestureMapping = createMapping(
	'pinky-pinch-feedback',
	'Thumb-Pinky → Delay Feedback',
	{
		type: 'pinch_distance',
		hand: 'Left',
		finger: LandmarkIndex.PINKY_TIP,
		inputRange: [0.03, 0.2],
		curve: 'smooth-step'
	},
	{
		deviceId: 'delay',
		parameterName: 'feedback',
		outputRange: [0.1, 0.85]
	},
	{
		type: 'one-euro',
		minCutoff: 1.0,
		beta: 0.008
	}
);

/**
 * Get all preset mappings
 */
export const getAllPresets = (): GestureMapping[] => [
	PINCH_TO_FILTER_CUTOFF,
	WRIST_Y_TO_VOLUME,
	DEPTH_TO_DELAY,
	ROTATION_TO_PAN,
	OPENNESS_TO_RESONANCE,
	FINGER_CURL_TO_ATTACK,
	WRIST_X_TO_DETUNE,
	PINKY_PINCH_TO_FEEDBACK
];

/**
 * Get a starter set of mappings (most intuitive ones)
 */
export const getStarterPresets = (): GestureMapping[] => [
	PINCH_TO_FILTER_CUTOFF,
	WRIST_Y_TO_VOLUME,
	DEPTH_TO_DELAY
];

/**
 * Clone a preset with a new ID (for customization)
 */
export const clonePreset = (preset: GestureMapping, newId: string, newName?: string): GestureMapping => ({
	...preset,
	id: newId,
	name: newName ?? `${preset.name} (Copy)`,
	input: { ...preset.input },
	output: { ...preset.output },
	smoothing: { ...preset.smoothing }
});

