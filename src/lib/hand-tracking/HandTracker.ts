/**
 * HandTracker Module
 * 
 * Wraps MediaPipe Hands for real-time hand detection and tracking.
 * Provides a clean async interface for initializing and running detection.
 * 
 * Usage:
 *   const tracker = new HandTracker();
 *   await tracker.initialize();
 *   tracker.start(videoElement, (result) => {
 *     console.log(result.hands);
 *   });
 */

import { HandLandmarker, FilesetResolver, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type {
	HandTrackerConfig,
	HandTrackingCallback,
	HandTrackingResult,
	HandResult,
	Handedness,
	Landmark,
	DEFAULT_HAND_TRACKER_CONFIG
} from '../types/hand.js';

/**
 * HandTracker class wrapping MediaPipe Hands
 */
export class HandTracker {
	private handLandmarker: HandLandmarker | null = null;
	private isInitialized = false;
	private isRunning = false;
	private animationFrameId: number | null = null;
	private lastTimestamp = 0;
	private config: HandTrackerConfig;
	private callback: HandTrackingCallback | null = null;
	private videoElement: HTMLVideoElement | null = null;

	constructor(config: Partial<HandTrackerConfig> = {}) {
		this.config = {
			maxHands: config.maxHands ?? 2,
			minDetectionConfidence: config.minDetectionConfidence ?? 0.5,
			minTrackingConfidence: config.minTrackingConfidence ?? 0.5,
			modelAssetPath: config.modelAssetPath
		};
	}

	/**
	 * Initialize MediaPipe Hands with WASM runtime
	 * Must be called before starting detection
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			console.warn('HandTracker already initialized');
			return;
		}

		try {
			// Load MediaPipe WASM files from CDN
			const vision = await FilesetResolver.forVisionTasks(
				'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
			);

			// Create HandLandmarker with configuration
			this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
				baseOptions: {
					modelAssetPath:
						this.config.modelAssetPath ??
						'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
					delegate: 'GPU' // Use GPU acceleration when available
				},
				runningMode: 'VIDEO',
				numHands: this.config.maxHands,
				minHandDetectionConfidence: this.config.minDetectionConfidence,
				minTrackingConfidence: this.config.minTrackingConfidence
			});

			this.isInitialized = true;
			console.log('HandTracker initialized successfully');
		} catch (error) {
			console.error('Failed to initialize HandTracker:', error);
			throw error;
		}
	}

	/**
	 * Start hand tracking on a video element
	 * @param video - The video element to track (usually webcam feed)
	 * @param callback - Function called on each frame with results
	 */
	start(video: HTMLVideoElement, callback: HandTrackingCallback): void {
		if (!this.isInitialized || !this.handLandmarker) {
			throw new Error('HandTracker not initialized. Call initialize() first.');
		}

		if (this.isRunning) {
			console.warn('HandTracker already running');
			return;
		}

		this.videoElement = video;
		this.callback = callback;
		this.isRunning = true;
		this.lastTimestamp = performance.now();

		// Start the detection loop
		this.detectLoop();
	}

	/**
	 * Stop hand tracking
	 */
	stop(): void {
		this.isRunning = false;
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
		this.callback = null;
		this.videoElement = null;
	}

	/**
	 * Main detection loop running at video frame rate
	 */
	private detectLoop = (): void => {
		if (!this.isRunning || !this.handLandmarker || !this.videoElement || !this.callback) {
			return;
		}

		const now = performance.now();

		// Only process if video has new data
		if (this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
			// Ensure we have a new timestamp to avoid duplicate processing
			if (now !== this.lastTimestamp) {
				try {
					const mpResult = this.handLandmarker.detectForVideo(this.videoElement, now);
					const result = this.transformResult(mpResult, now);
					this.callback(result);
				} catch (error) {
					console.error('Error during hand detection:', error);
				}
				this.lastTimestamp = now;
			}
		}

		// Schedule next frame
		this.animationFrameId = requestAnimationFrame(this.detectLoop);
	};

	/**
	 * Transform MediaPipe result to our internal format
	 */
	private transformResult(mpResult: HandLandmarkerResult, timestamp: number): HandTrackingResult {
		const hands: HandResult[] = [];

		if (mpResult.landmarks && mpResult.landmarks.length > 0) {
			for (let i = 0; i < mpResult.landmarks.length; i++) {
				const landmarks = mpResult.landmarks[i] as Landmark[];
				const worldLandmarks = (mpResult.worldLandmarks?.[i] ?? landmarks) as Landmark[];
				const handednessData = mpResult.handednesses?.[i]?.[0];

				hands.push({
					landmarks,
					worldLandmarks,
					handedness: (handednessData?.categoryName as Handedness) ?? 'Right',
					confidence: handednessData?.score ?? 1.0
				});
			}
		}

		return {
			hands,
			timestamp,
			frameWidth: this.videoElement?.videoWidth ?? 0,
			frameHeight: this.videoElement?.videoHeight ?? 0
		};
	}

	/**
	 * Run detection on a single image (for testing or single-frame mode)
	 */
	async detectImage(image: ImageBitmap | HTMLImageElement): Promise<HandTrackingResult> {
		if (!this.isInitialized || !this.handLandmarker) {
			throw new Error('HandTracker not initialized. Call initialize() first.');
		}

		// Need to switch to IMAGE mode for single image detection
		await this.handLandmarker.setOptions({ runningMode: 'IMAGE' });
		
		const mpResult = this.handLandmarker.detect(image);
		const result = this.transformResult(mpResult, performance.now());
		
		// Switch back to VIDEO mode
		await this.handLandmarker.setOptions({ runningMode: 'VIDEO' });

		return result;
	}

	/**
	 * Update tracker configuration at runtime
	 */
	async updateConfig(newConfig: Partial<HandTrackerConfig>): Promise<void> {
		this.config = { ...this.config, ...newConfig };

		if (this.isInitialized && this.handLandmarker) {
			await this.handLandmarker.setOptions({
				numHands: this.config.maxHands,
				minHandDetectionConfidence: this.config.minDetectionConfidence,
				minTrackingConfidence: this.config.minTrackingConfidence
			});
		}
	}

	/**
	 * Clean up resources
	 */
	destroy(): void {
		this.stop();
		if (this.handLandmarker) {
			this.handLandmarker.close();
			this.handLandmarker = null;
		}
		this.isInitialized = false;
	}

	/**
	 * Check if tracker is initialized
	 */
	get initialized(): boolean {
		return this.isInitialized;
	}

	/**
	 * Check if tracker is currently running
	 */
	get running(): boolean {
		return this.isRunning;
	}
}

/**
 * Singleton instance for global access
 */
let globalTracker: HandTracker | null = null;

export const getHandTracker = (config?: Partial<HandTrackerConfig>): HandTracker => {
	if (!globalTracker) {
		globalTracker = new HandTracker(config);
	}
	return globalTracker;
};

export const destroyHandTracker = (): void => {
	if (globalTracker) {
		globalTracker.destroy();
		globalTracker = null;
	}
};

