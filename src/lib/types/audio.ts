/**
 * Audio Type Definitions
 * 
 * Types for Audiotool SDK integration and audio parameter control.
 */

/**
 * Audio device types available in Audiotool
 */
export type DeviceType =
	| 'stompboxSlope'
	| 'ringModulator'
	| 'waveshaper'
	| 'centroid'
	| 'audioSplitter'
	| 'delay'
	| 'reverb'
	| 'compressor'
	| 'eq'
	| 'filter'
	| 'synth'
	| 'sampler'
	| 'pulverisateur'
	| 'heisenberg'
	| 'machiniste'
	| 'bassline'
	| 'beatbox'
	| 'tonematrix'
	| 'minimachine'
	| 'output';

/**
 * Callback for parameter changes
 */
export type ParameterChangeCallback = (
	deviceId: string,
	parameterName: string,
	value: number
) => void;

/**
 * Audio controller configuration (kept for interface compatibility)
 */
export interface AudioControllerConfig {
	/**
	 * Initial BPM (not used with Audiotool)
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

