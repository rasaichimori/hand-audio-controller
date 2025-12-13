/**
 * AudiotoolController Module
 *
 * Integrates with the Audiotool Nexus SDK to control audio devices
 * in an online Audiotool project using hand gestures.
 *
 * Documentation: https://developer-dev.audiotl.com/js-package-documentation/
 */

import { createAudiotoolClient } from "@audiotool/nexus";
import { getLoginStatus } from "@audiotool/nexus/utils";
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
  | "error"
  | "needs_login";

/**
 * AudiotoolController class using Nexus SDK
 */
export class AudiotoolController {
  private client: any = null;
  private document: any = null;
  private loginStatus: any = null;

  private _connectionState: ConnectionState = "disconnected";
  private _isInitialized = false;
  private _projectUrl = "";
  private _clientId = "";
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
   * Set client ID for OAuth
   */
  setClientId(clientId: string): void {
    this._clientId = clientId;
    this.notifyStateChange();
  }

  /**
   * Get current client ID
   */
  get clientId(): string {
    return this._clientId;
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
   * Check login status and potentially trigger login
   */
  async checkLogin(): Promise<boolean> {
    if (!this._clientId) {
      this._error = "Client ID is required";
      this._connectionState = "error";
      this.notifyStateChange();
      return false;
    }

    try {
      console.log("[Audiotool] Checking login status...");
      this.loginStatus = await getLoginStatus({
        clientId: this._clientId,
        redirectUrl: "http://127.0.0.1:5173/",
        scope: "project:write",
      });
      console.log(this.loginStatus);
      if (!this.loginStatus.loggedIn) {
        console.log("[Audiotool] User not logged in");
        this._connectionState = "needs_login";
        this.notifyStateChange();
        return false;
      }

      console.log("[Audiotool] User is logged in");
      return true;
    } catch (error) {
      console.error("[Audiotool] Login check failed:", error);
      this._error = `Login check failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      this._connectionState = "error";
      this.notifyStateChange();
      return false;
    }
  }

  /**
   * Trigger the login flow
   */
  triggerLogin(): void {
    if (this.loginStatus && !this.loginStatus.loggedIn) {
      console.log("[Audiotool] Triggering login...");
      this.loginStatus.login();
    }
  }

  /**
   * Connect to an Audiotool project
   */
  async connect(): Promise<void> {
    if (!this._clientId) {
      this._error = "Client ID is required";
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
      // Check login status first
      const isLoggedIn = await this.checkLogin();
      if (!isLoggedIn) {
        return; // State already set in checkLogin
      }

      console.log("[Audiotool] Creating client...");
      // Create client with the login status (OAuth authorization)
      this.client = await createAudiotoolClient({
        authorization: this.loginStatus,
      });
      console.log("[Audiotool] Client created successfully");

      // Create synced document config
      const docConfig = {
        mode: "online" as const,
        project: this._projectUrl,
      };
      console.log(
        "[Audiotool] Creating synced document for:",
        this._projectUrl
      );

      // Create and start the synced document
      this.document = await this.client.createSyncedDocument(docConfig);
      console.log("[Audiotool] Document created, starting...");

      await this.document.start();
      console.log("[Audiotool] Document started successfully");

      this._isInitialized = true;

      // Discover devices in the project
      console.log("[Audiotool] Discovering devices...");
      await this.discoverDevices();

      this._connectionState = "connected";
      console.log(
        "[Audiotool] Connected! Found",
        this._devices.size,
        "devices"
      );
      this.notifyStateChange();
    } catch (error) {
      console.error("[Audiotool] Failed to connect:", error);
      this._error = `Connection failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
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

    this.client = null;
    this._devices.clear();
    this._selectedDeviceId = null;
    this._selectedParameterName = null;
    this._connectionState = "disconnected";
    this._error = null;
    this._isInitialized = false;
    this.notifyStateChange();
  }

  /**
   * Discover devices in the connected project
   */
  private async discoverDevices(): Promise<void> {
    if (!this.document) return;

    this._devices.clear();

    try {
      // Device types to look for (from Audiotool)
      const deviceTypes = [
        "stompboxSlope",
        "stompboxDelay",
        "stompboxReverb",
        "stompboxDistortion",
        "stompboxCompressor",
        "stompboxBitcrusher",
        "stompboxChorus",
        "stompboxFlanger",
        "stompboxPhaser",
        "stompboxTremolo",
        "stompboxFilter",
        "ringModulator",
        "waveshaper",
        "centroid",
        "audioSplitter",
        "pulverisateur",
        "heisenberg",
        "machiniste",
        "bassline",
        "tb303",
        "beatbox",
        "tonematrix",
        "minimachine",
        "kobolt",
        "output",
      ];

      // Debug: Get all entities first
      try {
        const allEntities = this.document.queryEntitiesWithoutLock.get();
        console.log(
          "[Audiotool] All entities in document:",
          allEntities.length
        );

        // Log entity types found
        const typeCounts: Record<string, number> = {};
        for (const entity of allEntities) {
          const type = entity.$type ?? entity.type ?? "unknown";
          typeCounts[type] = (typeCounts[type] || 0) + 1;
        }
        console.log("[Audiotool] Entity types found:", typeCounts);
      } catch (err) {
        console.log("[Audiotool] Could not query all entities:", err);
      }

      // Query devices by type
      for (const deviceType of deviceTypes) {
        try {
          const entities = this.document.queryEntitiesWithoutLock
            .ofTypes(deviceType)
            .get();

          if (entities.length > 0) {
            console.log(
              `[Audiotool] Found ${entities.length} ${deviceType} device(s)`
            );
          }

          for (const entity of entities) {
            console.log(`[Audiotool] Device ${deviceType}:`, entity.id, entity);
            const device: AudiotoolDevice = {
              id: entity.id,
              type: deviceType,
              name: this.getDeviceName(deviceType, entity.id),
              parameters: this.extractParameters(entity, deviceType),
            };
            console.log(
              `[Audiotool] Extracted parameters:`,
              Array.from(device.parameters.keys())
            );
            this._devices.set(device.id, device);
          }
        } catch (err) {
          // This device type might not exist in the project
        }
      }

      console.log(
        `[Audiotool] Total discovered: ${this._devices.size} devices`
      );
    } catch (error) {
      console.error("[Audiotool] Error discovering devices:", error);
    }
  }

  /**
   * Get a human-readable name for a device
   */
  private getDeviceName(type: string, id: string): string {
    const cleanType = type
      .replace(/^stompbox/, "")
      .replace(/([A-Z])/g, " $1")
      .trim()
      .replace(/^./, (s) => s.toUpperCase());

    return `${cleanType} (${id.slice(-6)})`;
  }

  /**
   * Extract parameters from an entity
   */
  private extractParameters(
    entity: any,
    deviceType: string
  ): Map<string, AudiotoolParameter> {
    const params = new Map<string, AudiotoolParameter>();

    // Parameter names by device type
    const paramsByType: Record<string, string[]> = {
      stompboxSlope: ["frequencyHz", "resonanceFactor", "filterMode"],
      stompboxDelay: ["feedbackFactor", "mix", "stepLengthIndex"],
      stompboxReverb: ["roomSize", "damping", "mix", "width"],
      stompboxDistortion: ["drive", "tone", "level"],
      stompboxCompressor: ["threshold", "ratio", "attack", "release", "gain"],
      stompboxFilter: ["frequency", "resonance", "filterType"],
      ringModulator: ["boostGain", "frequency", "mix"],
      waveshaper: ["drive", "mix"],
      pulverisateur: ["gate", "comb", "sustain", "release"],
      heisenberg: ["cutoff", "resonance", "drive", "volume"],
      bassline: ["cutoff", "resonance", "envMod", "decay", "accent"],
      tb303: ["cutoff", "resonance", "envMod", "decay", "accent"],
      tonematrix: ["patternIndex", "volume"],
    };

    const paramsToLookFor = paramsByType[deviceType] || [];
    const commonParams = [
      "volume",
      "gain",
      "level",
      "mix",
      "pan",
      "frequency",
      "cutoff",
      "resonance",
      "drive",
      "attack",
      "decay",
      "sustain",
      "release",
      "rate",
      "depth",
      "feedback",
      "time",
      "displayName",
    ];

    const allParams = [...new Set([...paramsToLookFor, ...commonParams])];

    for (const paramName of allParams) {
      try {
        // Access via entity.fields API
        const field = entity.fields?.[paramName];
        if (field !== undefined) {
          const value = field.value ?? field.get?.() ?? field;
          if (typeof value === "number" || typeof value === "string") {
            params.set(paramName, {
              name: paramName,
              value: typeof value === "number" ? value : 0,
            });
          }
        }
      } catch {
        // Parameter doesn't exist
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
      this._selectedParameterName = null;
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
    const device = this._devices.get(deviceId);
    if (!device) return;

    try {
      const mappedValue = this.mapParameterValue(paramName, clampedValue);

      // Use document.modify() to update parameters
      await this.document.modify((t: any) => {
        const entity = t.entities.ofIds(deviceId).getOne();
        if (entity) {
          t.update(entity, {
            [paramName]: mappedValue,
          });
        }
      });

      // Update local cache
      const param = device.parameters.get(paramName);
      if (param) {
        param.value = mappedValue;
      }
    } catch (error) {
      // Silent fail for frequent parameter updates
    }
  }

  /**
   * Map normalized 0-1 value to parameter range
   */
  private mapParameterValue(
    paramName: string,
    normalizedValue: number
  ): number {
    const lowerName = paramName.toLowerCase();

    if (lowerName.includes("frequency") || lowerName.includes("cutoff")) {
      return 20 * Math.pow(1000, normalizedValue); // 20Hz to 20kHz
    }
    if (lowerName.includes("resonance") || lowerName.includes("factor")) {
      return normalizedValue;
    }
    if (
      lowerName.includes("gain") ||
      lowerName.includes("boost") ||
      lowerName.includes("level")
    ) {
      return normalizedValue * 2;
    }
    if (
      lowerName.includes("time") ||
      lowerName.includes("delay") ||
      lowerName.includes("attack") ||
      lowerName.includes("decay") ||
      lowerName.includes("release")
    ) {
      return normalizedValue * 2;
    }
    if (lowerName.includes("mix") || lowerName.includes("wet")) {
      return normalizedValue;
    }
    if (lowerName.includes("feedback")) {
      return normalizedValue * 0.95;
    }
    if (
      lowerName.includes("mode") ||
      lowerName.includes("type") ||
      lowerName.includes("index")
    ) {
      return Math.floor(normalizedValue * 4);
    }
    if (lowerName.includes("drive")) {
      return normalizedValue * 10;
    }

    return normalizedValue;
  }

  /**
   * Set the selected parameter value
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
   * Check if needs login
   */
  get needsLogin(): boolean {
    return this._connectionState === "needs_login";
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    await this.disconnect();
    this.loginStatus = null;
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
