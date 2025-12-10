/**
 * AudiotoolController Module
 *
 * Integrates with the Audiotool Nexus SDK to control audio devices
 * in an online Audiotool project using hand gestures.
 */

import type { AudioControllerConfig } from "../types/audio.js";

/**
 * Audiotool device info (simplified for our use case)
 */
export interface AudiotoolDevice {
  id: string;
  type: string;
  name: string;
  parameters: Map<string, AudiotoolParameter>;
}

/**
 * Parameter info
 */
export interface AudiotoolParameter {
  name: string;
  value: number;
  min?: number;
  max?: number;
}

/**
 * Connection state
 */
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/**
 * AudiotoolController class using Nexus SDK
 */
export class AudiotoolController {
  private client: any = null;
  private document: any = null;
  private nexus: any = null;

  private _connectionState: ConnectionState = "disconnected";
  private _isInitialized = false;
  private _projectUrl = "";
  private _pat = "";
  private _error: string | null = null;

  // Discovered devices from the project
  private _devices: Map<string, AudiotoolDevice> = new Map();

  // Currently selected device/parameter for control
  private _selectedDeviceId: string | null = null;
  private _selectedParameterName: string | null = null;

  // Callbacks
  private onStateChange: (() => void) | null = null;

  constructor(_config: Partial<AudioControllerConfig> = {}) {
    // Config not used for Audiotool, kept for interface compatibility
  }

  /**
   * Set callback for state changes
   */
  setStateChangeCallback(callback: () => void): void {
    this.onStateChange = callback;
  }

  /**
   * Notify state change
   */
  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange();
    }
  }

  /**
   * Set Personal Access Token
   */
  setPAT(pat: string): void {
    this._pat = pat;
    if (this.client) {
      this.client.setPAT(pat);
    }
    this.notifyStateChange();
  }

  /**
   * Get current PAT
   */
  get pat(): string {
    return this._pat;
  }

  /**
   * Check if PAT is set
   */
  hasPAT(): boolean {
    return this._pat.length > 0;
  }

  /**
   * Set project URL
   */
  setProjectUrl(url: string): void {
    this._projectUrl = url;
    this.notifyStateChange();
  }

  /**
   * Get project URL
   */
  get projectUrl(): string {
    return this._projectUrl;
  }

  /**
   * Get connection state
   */
  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  /**
   * Get error message
   */
  get error(): string | null {
    return this._error;
  }

  /**
   * Get all discovered devices
   */
  get devices(): AudiotoolDevice[] {
    return Array.from(this._devices.values());
  }

  /**
   * Get selected device ID
   */
  get selectedDeviceId(): string | null {
    return this._selectedDeviceId;
  }

  /**
   * Get selected parameter name
   */
  get selectedParameterName(): string | null {
    return this._selectedParameterName;
  }

  /**
   * Get the selected device
   */
  get selectedDevice(): AudiotoolDevice | null {
    if (!this._selectedDeviceId) return null;
    return this._devices.get(this._selectedDeviceId) ?? null;
  }

  /**
   * Initialize the Audiotool client
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) {
      console.warn("AudiotoolController already initialized");
      return;
    }

    try {
      // Dynamically import the nexus SDK
      this.nexus = await import("@audiotool/nexus");
      this.client = this.nexus.createAudiotoolClient();

      if (this._pat) {
        this.client.setPAT(this._pat);
      }

      this._isInitialized = true;
      console.log("AudiotoolController initialized successfully");
      this.notifyStateChange();
    } catch (error) {
      console.error("Failed to initialize AudiotoolController:", error);
      this._error = `Failed to initialize: ${error instanceof Error ? error.message : "Unknown error"}`;
      this.notifyStateChange();
      throw error;
    }
  }

  /**
   * Connect to an Audiotool project
   */
  async connect(): Promise<void> {
    if (!this._isInitialized) {
      await this.initialize();
    }

    if (!this._pat) {
      this._error = "PAT is required to connect";
      this._connectionState = "error";
      this.notifyStateChange();
      return;
    }

    if (!this._projectUrl) {
      this._error = "Project URL is required";
      this._connectionState = "error";
      this.notifyStateChange();
      return;
    }

    this._connectionState = "connecting";
    this._error = null;
    this.notifyStateChange();

    try {
      // Ensure PAT is set on client
      this.client.setPAT(this._pat);

      // Create synced document config
      const docConfig = {
        mode: "online" as const,
        project: this._projectUrl,
      };

      // Create and start the synced document
      this.document = await this.client.createSyncedDocument(docConfig);
      await this.document.start();

      // Discover devices in the project
      await this.discoverDevices();

      this._connectionState = "connected";
      console.log("Connected to Audiotool project");
      this.notifyStateChange();
    } catch (error) {
      console.error("Failed to connect to Audiotool:", error);
      this._error = `Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      this._connectionState = "error";
      this.notifyStateChange();
    }
  }

  /**
   * Disconnect from the project
   */
  async disconnect(): Promise<void> {
    if (this.document) {
      try {
        await this.document.stop?.();
      } catch {
        // Ignore errors during disconnect
      }
      this.document = null;
    }

    this._devices.clear();
    this._selectedDeviceId = null;
    this._selectedParameterName = null;
    this._connectionState = "disconnected";
    this._error = null;
    this.notifyStateChange();
  }

  /**
   * Discover devices in the connected project
   * This reads the document model to find all devices
   */
  private async discoverDevices(): Promise<void> {
    if (!this.document) return;

    this._devices.clear();

    try {
      // Access the document's entity collection
      // The document.model contains all entities in the project
      const model = this.document.model;

      if (model && model.entities) {
        for (const [id, entity] of model.entities) {
          // Check if this entity is a device (has a type that looks like a device)
          const entityType = entity.$type ?? entity.type ?? "";

          // Skip non-device entities (like connections, anchors, etc.)
          if (this.isDeviceType(entityType)) {
            const device: AudiotoolDevice = {
              id: id.toString(),
              type: entityType,
              name: this.getDeviceName(entityType, id.toString()),
              parameters: this.extractParameters(entity),
            };
            this._devices.set(device.id, device);
          }
        }
      }

      console.log(`Discovered ${this._devices.size} devices`);
    } catch (error) {
      console.error("Error discovering devices:", error);
      // Don't throw - we might still be able to work with the project
    }
  }

  /**
   * Check if an entity type represents a device
   */
  private isDeviceType(type: string): boolean {
    // Common Audiotool device types
    const deviceTypes = [
      "stompboxSlope",
      "ringModulator",
      "waveshaper",
      "centroid",
      "audioSplitter",
      "delay",
      "reverb",
      "compressor",
      "eq",
      "filter",
      "synth",
      "sampler",
      "pulverisateur",
      "heisenberg",
      "machiniste",
      "bassline",
      "beatbox",
      "tonematrix",
      "minimachine",
      "output", // Master output
    ];

    const lowerType = type.toLowerCase();
    return deviceTypes.some(
      (dt) => lowerType.includes(dt.toLowerCase()) || lowerType.includes("box")
    );
  }

  /**
   * Get a human-readable name for a device
   */
  private getDeviceName(type: string, id: string): string {
    // Clean up the type name
    const cleanType = type
      .replace(/([A-Z])/g, " $1")
      .trim()
      .replace(/^./, (s) => s.toUpperCase());

    return `${cleanType} (${id.slice(-6)})`;
  }

  /**
   * Extract parameters from an entity
   */
  private extractParameters(entity: any): Map<string, AudiotoolParameter> {
    const params = new Map<string, AudiotoolParameter>();

    // Common parameter names to look for
    const commonParams = [
      "frequencyHz",
      "frequency",
      "resonanceFactor",
      "resonance",
      "filterMode",
      "cutoff",
      "gain",
      "volume",
      "mix",
      "feedback",
      "time",
      "rate",
      "depth",
      "drive",
      "boostGain",
      "attack",
      "decay",
      "sustain",
      "release",
      "pan",
      "level",
    ];

    for (const paramName of commonParams) {
      if (paramName in entity) {
        const value = entity[paramName];
        if (typeof value === "number") {
          params.set(paramName, {
            name: paramName,
            value: value,
          });
        }
      }
    }

    // Also try to get all numeric properties
    for (const key of Object.keys(entity)) {
      if (
        !key.startsWith("$") &&
        !key.startsWith("_") &&
        typeof entity[key] === "number" &&
        !params.has(key)
      ) {
        params.set(key, {
          name: key,
          value: entity[key],
        });
      }
    }

    return params;
  }

  /**
   * Select a device for control
   */
  selectDevice(deviceId: string): void {
    if (this._devices.has(deviceId)) {
      this._selectedDeviceId = deviceId;
      this._selectedParameterName = null; // Reset parameter selection
      this.notifyStateChange();
    }
  }

  /**
   * Select a parameter for control
   */
  selectParameter(parameterName: string): void {
    this._selectedParameterName = parameterName;
    this.notifyStateChange();
  }

  /**
   * Set a parameter value on a device
   * @param deviceId - The device ID
   * @param paramName - The parameter name
   * @param value - The normalized value (0-1)
   */
  async setParameter(
    deviceId: string,
    paramName: string,
    value: number
  ): Promise<void> {
    if (!this.document || this._connectionState !== "connected") {
      return;
    }

    const clampedValue = Math.max(0, Math.min(1, value));

    try {
      // Use the document's modify method to change parameters
      await this.document.modify((t: any) => {
        // Get the entity location from the device ID
        const location = { id: deviceId };

        // Different parameters have different ranges
        // We'll need to map our 0-1 value to the appropriate range
        const mappedValue = this.mapParameterValue(paramName, clampedValue);

        // Update the parameter
        t.update(location, {
          [paramName]: mappedValue,
        });
      });

      // Update our local cache
      const device = this._devices.get(deviceId);
      if (device) {
        const param = device.parameters.get(paramName);
        if (param) {
          param.value = clampedValue;
        }
      }
    } catch (error) {
      // Silent fail for parameter updates to avoid spamming console
      // This can happen if the parameter doesn't exist or is read-only
    }
  }

  /**
   * Map a normalized 0-1 value to the appropriate parameter range
   */
  private mapParameterValue(paramName: string, normalizedValue: number): number {
    const lowerName = paramName.toLowerCase();

    // Frequency parameters (typically 20Hz - 20000Hz, logarithmic)
    if (lowerName.includes("frequency") || lowerName.includes("cutoff")) {
      return 20 * Math.pow(1000, normalizedValue); // 20Hz to 20kHz
    }

    // Resonance/Q (typically 0-1 or 0-20)
    if (lowerName.includes("resonance") || lowerName.includes("q")) {
      return normalizedValue; // Keep 0-1 range
    }

    // Gain in dB (typically -inf to +12dB)
    if (lowerName.includes("gain") || lowerName.includes("boost")) {
      return normalizedValue * 12; // 0 to 12 dB
    }

    // Time parameters (typically 0-2 seconds)
    if (lowerName.includes("time") || lowerName.includes("delay")) {
      return normalizedValue * 2; // 0 to 2 seconds
    }

    // Mode/type selectors (integers)
    if (lowerName.includes("mode") || lowerName.includes("type")) {
      return Math.floor(normalizedValue * 4); // 0 to 4
    }

    // Default: keep 0-1 range
    return normalizedValue;
  }

  /**
   * Set the selected parameter value (convenience method)
   */
  async setSelectedParameter(value: number): Promise<void> {
    if (this._selectedDeviceId && this._selectedParameterName) {
      await this.setParameter(
        this._selectedDeviceId,
        this._selectedParameterName,
        value
      );
    }
  }

  /**
   * Check if initialized
   */
  get initialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this._connectionState === "connected";
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    await this.disconnect();
    this.client = null;
    this.nexus = null;
    this._isInitialized = false;
  }
}

/**
 * Singleton instance
 */
let globalController: AudiotoolController | null = null;

export const getAudiotoolController = (
  config?: Partial<AudioControllerConfig>
): AudiotoolController => {
  if (!globalController) {
    globalController = new AudiotoolController(config);
  }
  return globalController;
};

export const destroyAudiotoolController = async (): Promise<void> => {
  if (globalController) {
    await globalController.destroy();
    globalController = null;
  }
};

