/**
 * Audio Type Definitions
 * 
 * Types for Audiotool SDK integration and audio parameter control.
 */

/**
 * Audio device types available in Audiotool
 */
export type DeviceType =
	| 'synthesizer'
	| 'sampler'
	| 'filter'
	| 'delay'
	| 'reverb'
	| 'compressor'
	| 'eq'
	| 'distortion'
	| 'chorus'
	| 'phaser'
	| 'flanger'
	| 'mixer';

/**
 * Represents a parameter on an audio device
 */
export interface AudioParameter {
	id: string;
	name: string;
	min: number;
	max: number;
	default: number;
	current: number;
	unit?: string;
}

/**
 * Represents an audio device in the signal chain
 */
export interface AudioDevice {
	id: string;
	name: string;
	type: DeviceType;
	parameters: Map<string, AudioParameter>;
	inputConnections: string[];
	outputConnections: string[];
}

/**
 * Device graph representing the full audio routing
 */
export interface DeviceGraph {
	devices: Map<string, AudioDevice>;
	connections: Array<{
		from: { deviceId: string; output: number };
		to: { deviceId: string; input: number };
	}>;
}

/**
 * Audio engine state
 */
export interface AudioEngineState {
	isInitialized: boolean;
	isPlaying: boolean;
	masterVolume: number;
	bpm: number;
	sampleRate: number;
}

/**
 * Callback for parameter changes
 */
export type ParameterChangeCallback = (
	deviceId: string,
	parameterName: string,
	value: number
) => void;

/**
 * Audio controller configuration
 */
export interface AudioControllerConfig {
	/**
	 * Initial BPM
	 */
	bpm?: number;
	
	/**
	 * Initial master volume (0-1)
	 */
	masterVolume?: number;
	
	/**
	 * Whether to auto-start playback
	 */
	autoPlay?: boolean;
}

/**
 * Default audio controller configuration
 */
export const DEFAULT_AUDIO_CONFIG: AudioControllerConfig = {
	bpm: 120,
	masterVolume: 0.8,
	autoPlay: false
};

/**
 * Preset device configurations for quick setup
 */
export interface DevicePreset {
	name: string;
	type: DeviceType;
	parameters: Record<string, number>;
}

/**
 * Common synthesizer parameters
 */
export const SYNTH_PARAMS = {
	CUTOFF: 'cutoff',
	RESONANCE: 'resonance',
	ATTACK: 'attack',
	DECAY: 'decay',
	SUSTAIN: 'sustain',
	RELEASE: 'release',
	OSCILLATOR_MIX: 'oscillatorMix',
	DETUNE: 'detune',
	VOLUME: 'volume',
	PAN: 'pan'
} as const;

/**
 * Common filter parameters
 */
export const FILTER_PARAMS = {
	CUTOFF: 'cutoff',
	RESONANCE: 'resonance',
	TYPE: 'type',
	DRIVE: 'drive'
} as const;

/**
 * Common delay parameters
 */
export const DELAY_PARAMS = {
	TIME: 'time',
	FEEDBACK: 'feedback',
	MIX: 'mix',
	SYNC: 'sync'
} as const;

