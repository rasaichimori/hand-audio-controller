/**
 * AudioController Module
 * 
 * Provides audio synthesis and parameter control using the Web Audio API.
 * This implementation creates a simple synth with filter and delay effects
 * that can be controlled via hand gestures.
 * 
 * When the Audiotool SDK becomes available, this can be extended to integrate
 * with the full Audiotool platform.
 */

import type { AudioControllerConfig } from '../types/audio.js';

/**
 * Simple oscillator configuration
 */
interface OscillatorConfig {
	type: OscillatorType;
	frequency: number;
	detune: number;
}

/**
 * Audio Controller class using Web Audio API
 */
export class AudioController {
	private audioContext: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private oscillators: OscillatorNode[] = [];
	private filter: BiquadFilterNode | null = null;
	private delay: DelayNode | null = null;
	private delayFeedback: GainNode | null = null;
	private delayMix: GainNode | null = null;
	private dryGain: GainNode | null = null;
	private panner: StereoPannerNode | null = null;
	private lfo: OscillatorNode | null = null;
	private lfoGain: GainNode | null = null;

	private isInitialized = false;
	private isPlaying = false;
	private config: AudioControllerConfig;

	// Parameter state
	private params: Map<string, number> = new Map();

	constructor(config: Partial<AudioControllerConfig> = {}) {
		this.config = {
			bpm: config.bpm ?? 120,
			masterVolume: config.masterVolume ?? 0.8,
			autoPlay: config.autoPlay ?? false
		};

		// Initialize default parameter values
		this.params.set('filter.cutoff', 0.5);
		this.params.set('filter.resonance', 0.3);
		this.params.set('delay.mix', 0.3);
		this.params.set('delay.time', 0.3);
		this.params.set('delay.feedback', 0.4);
		this.params.set('synth.detune', 0);
		this.params.set('synth.pan', 0.5);
		this.params.set('master.gain', this.config.masterVolume!);
	}

	/**
	 * Initialize the audio context and create the signal chain
	 * Must be called after user interaction due to browser autoplay policies
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			console.warn('AudioController already initialized');
			return;
		}

		try {
			// Create audio context
			this.audioContext = new AudioContext();

			// Create master gain
			this.masterGain = this.audioContext.createGain();
			this.masterGain.gain.value = this.config.masterVolume!;
			this.masterGain.connect(this.audioContext.destination);

			// Create stereo panner
			this.panner = this.audioContext.createStereoPanner();
			this.panner.pan.value = 0;
			this.panner.connect(this.masterGain);

			// Create filter
			this.filter = this.audioContext.createBiquadFilter();
			this.filter.type = 'lowpass';
			this.filter.frequency.value = 2000;
			this.filter.Q.value = 5;
			this.filter.connect(this.panner);

			// Create delay effect chain
			this.delay = this.audioContext.createDelay(2.0);
			this.delay.delayTime.value = 0.3;

			this.delayFeedback = this.audioContext.createGain();
			this.delayFeedback.gain.value = 0.4;

			this.delayMix = this.audioContext.createGain();
			this.delayMix.gain.value = 0.3;

			this.dryGain = this.audioContext.createGain();
			this.dryGain.gain.value = 0.7;

			// Connect delay chain
			this.filter.connect(this.dryGain);
			this.dryGain.connect(this.panner);

			this.filter.connect(this.delay);
			this.delay.connect(this.delayMix);
			this.delayMix.connect(this.panner);
			this.delay.connect(this.delayFeedback);
			this.delayFeedback.connect(this.delay);

			// Create LFO for filter modulation
			this.lfo = this.audioContext.createOscillator();
			this.lfo.type = 'sine';
			this.lfo.frequency.value = 0.5;

			this.lfoGain = this.audioContext.createGain();
			this.lfoGain.gain.value = 200;

			this.lfo.connect(this.lfoGain);
			this.lfoGain.connect(this.filter.frequency);
			this.lfo.start();

			this.isInitialized = true;
			console.log('AudioController initialized successfully');

			if (this.config.autoPlay) {
				await this.play();
			}
		} catch (error) {
			console.error('Failed to initialize AudioController:', error);
			throw error;
		}
	}

	/**
	 * Create and start oscillators for playback
	 */
	private createOscillators(): void {
		if (!this.audioContext || !this.filter) return;

		// Create a chord (minor triad)
		const frequencies = [130.81, 155.56, 196.00]; // C3, Eb3, G3

		for (const freq of frequencies) {
			// Sawtooth oscillator
			const saw = this.audioContext.createOscillator();
			saw.type = 'sawtooth';
			saw.frequency.value = freq;
			saw.detune.value = this.params.get('synth.detune') ?? 0;

			// Add slight detuning for richness
			const saw2 = this.audioContext.createOscillator();
			saw2.type = 'sawtooth';
			saw2.frequency.value = freq;
			saw2.detune.value = (this.params.get('synth.detune') ?? 0) + 7;

			// Oscillator gains
			const oscGain = this.audioContext.createGain();
			oscGain.gain.value = 0.15;

			saw.connect(oscGain);
			saw2.connect(oscGain);
			oscGain.connect(this.filter);

			saw.start();
			saw2.start();

			this.oscillators.push(saw, saw2);
		}
	}

	/**
	 * Set a parameter value
	 * @param deviceId - The device identifier (filter, delay, synth, master)
	 * @param paramName - The parameter name
	 * @param value - The normalized value (0-1)
	 */
	setParameter(deviceId: string, paramName: string, value: number): void {
		const key = `${deviceId}.${paramName}`;
		const clampedValue = Math.max(0, Math.min(1, value));
		this.params.set(key, clampedValue);

		if (!this.audioContext) return;

		// Apply parameter changes
		switch (key) {
			case 'filter.cutoff':
				if (this.filter) {
					// Map 0-1 to 100-10000 Hz (logarithmic)
					const freq = 100 * Math.pow(100, clampedValue);
					this.filter.frequency.setTargetAtTime(freq, this.audioContext.currentTime, 0.01);
				}
				break;

			case 'filter.resonance':
				if (this.filter) {
					// Map 0-1 to 0-20 Q
					const q = clampedValue * 20;
					this.filter.Q.setTargetAtTime(q, this.audioContext.currentTime, 0.01);
				}
				break;

			case 'delay.mix':
				if (this.delayMix && this.dryGain) {
					this.delayMix.gain.setTargetAtTime(clampedValue, this.audioContext.currentTime, 0.01);
					this.dryGain.gain.setTargetAtTime(1 - clampedValue * 0.5, this.audioContext.currentTime, 0.01);
				}
				break;

			case 'delay.time':
				if (this.delay) {
					// Map 0-1 to 0.05-1.0 seconds
					const time = 0.05 + clampedValue * 0.95;
					this.delay.delayTime.setTargetAtTime(time, this.audioContext.currentTime, 0.01);
				}
				break;

			case 'delay.feedback':
				if (this.delayFeedback) {
					// Limit feedback to prevent runaway
					const feedback = clampedValue * 0.85;
					this.delayFeedback.gain.setTargetAtTime(feedback, this.audioContext.currentTime, 0.01);
				}
				break;

			case 'synth.detune':
				// Map 0-1 to -100 to +100 cents
				const detune = (clampedValue - 0.5) * 200;
				for (let i = 0; i < this.oscillators.length; i += 2) {
					if (this.oscillators[i]) {
						this.oscillators[i].detune.setTargetAtTime(detune, this.audioContext.currentTime, 0.01);
					}
					if (this.oscillators[i + 1]) {
						this.oscillators[i + 1].detune.setTargetAtTime(detune + 7, this.audioContext.currentTime, 0.01);
					}
				}
				break;

			case 'synth.pan':
				if (this.panner) {
					// Map 0-1 to -1 to +1
					const pan = (clampedValue - 0.5) * 2;
					this.panner.pan.setTargetAtTime(pan, this.audioContext.currentTime, 0.01);
				}
				break;

			case 'master.gain':
				if (this.masterGain) {
					this.masterGain.gain.setTargetAtTime(clampedValue, this.audioContext.currentTime, 0.01);
				}
				break;
		}
	}

	/**
	 * Get current parameter value
	 */
	getParameter(deviceId: string, paramName: string): number | undefined {
		return this.params.get(`${deviceId}.${paramName}`);
	}

	/**
	 * Start audio playback
	 */
	async play(): Promise<void> {
		if (!this.audioContext || this.isPlaying) return;

		try {
			// Resume context if suspended
			if (this.audioContext.state === 'suspended') {
				await this.audioContext.resume();
			}

			// Create oscillators
			this.createOscillators();
			this.isPlaying = true;
			console.log('Audio playback started');
		} catch (error) {
			console.error('Failed to start playback:', error);
		}
	}

	/**
	 * Stop audio playback
	 */
	async stop(): Promise<void> {
		if (!this.isPlaying) return;

		try {
			// Stop and disconnect all oscillators
			for (const osc of this.oscillators) {
				try {
					osc.stop();
					osc.disconnect();
				} catch {
					// Oscillator might already be stopped
				}
			}
			this.oscillators = [];
			this.isPlaying = false;
			console.log('Audio playback stopped');
		} catch (error) {
			console.error('Failed to stop playback:', error);
		}
	}

	/**
	 * Toggle playback
	 */
	async togglePlayback(): Promise<void> {
		if (this.isPlaying) {
			await this.stop();
		} else {
			await this.play();
		}
	}

	/**
	 * Trigger a note (for future MIDI-like functionality)
	 */
	triggerNote(note: number = 60, velocity: number = 100, duration: number = 0.5): void {
		if (!this.audioContext || !this.filter) return;

		// Convert MIDI note to frequency
		const frequency = 440 * Math.pow(2, (note - 69) / 12);

		// Create a temporary oscillator for the note
		const osc = this.audioContext.createOscillator();
		osc.type = 'sawtooth';
		osc.frequency.value = frequency;

		const noteGain = this.audioContext.createGain();
		noteGain.gain.value = velocity / 127 * 0.3;

		// ADSR envelope
		const now = this.audioContext.currentTime;
		noteGain.gain.setValueAtTime(0, now);
		noteGain.gain.linearRampToValueAtTime(velocity / 127 * 0.3, now + 0.01);
		noteGain.gain.linearRampToValueAtTime(velocity / 127 * 0.2, now + 0.1);
		noteGain.gain.linearRampToValueAtTime(0, now + duration);

		osc.connect(noteGain);
		noteGain.connect(this.filter);

		osc.start(now);
		osc.stop(now + duration + 0.1);
	}

	/**
	 * Set master volume
	 */
	setMasterVolume(volume: number): void {
		this.setParameter('master', 'gain', volume);
	}

	/**
	 * Get list of available devices (virtual devices for this implementation)
	 */
	getDevices(): string[] {
		return ['synth', 'filter', 'delay', 'master'];
	}

	/**
	 * Get available parameters for a device
	 */
	getDeviceParameters(deviceId: string): string[] {
		const deviceParams: Record<string, string[]> = {
			synth: ['detune', 'pan'],
			filter: ['cutoff', 'resonance'],
			delay: ['mix', 'time', 'feedback'],
			master: ['gain']
		};
		return deviceParams[deviceId] ?? [];
	}

	/**
	 * Check if initialized
	 */
	get initialized(): boolean {
		return this.isInitialized;
	}

	/**
	 * Check if playing
	 */
	get playing(): boolean {
		return this.isPlaying;
	}

	/**
	 * Clean up resources
	 */
	async destroy(): Promise<void> {
		await this.stop();

		if (this.lfo) {
			try {
				this.lfo.stop();
				this.lfo.disconnect();
			} catch {
				// LFO might already be stopped
			}
		}

		if (this.audioContext) {
			await this.audioContext.close();
		}

		this.audioContext = null;
		this.masterGain = null;
		this.filter = null;
		this.delay = null;
		this.delayFeedback = null;
		this.delayMix = null;
		this.dryGain = null;
		this.panner = null;
		this.lfo = null;
		this.lfoGain = null;
		this.isInitialized = false;
	}
}

/**
 * Singleton instance
 */
let globalController: AudioController | null = null;

export const getAudioController = (config?: Partial<AudioControllerConfig>): AudioController => {
	if (!globalController) {
		globalController = new AudioController(config);
	}
	return globalController;
};

export const destroyAudioController = async (): Promise<void> => {
	if (globalController) {
		await globalController.destroy();
		globalController = null;
	}
};
