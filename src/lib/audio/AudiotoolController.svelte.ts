/**
 * AudiotoolController Module
 *
 * Integrates with the Audiotool Nexus SDK to control audio devices
 * in an online Audiotool project using hand gestures.
 *
 * Documentation: https://developer-dev.audiotl.com/js-package-documentation/
 */

import {
  createAudiotoolClient,
  getSchemaLocationDetails,
  type AudiotoolClient,
  type SyncedDocument,
} from "@audiotool/nexus";
import type {
  NexusLocation,
  PrimitiveField,
  SafeTransactionBuilder,
} from "@audiotool/nexus/document";
import { getLoginStatus, type LoginStatus } from "@audiotool/nexus/utils";
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
 * AudiotoolController class using Nexus SDK with Svelte 5 $state() runes
 */
export class AudiotoolController {
  #client: AudiotoolClient | null = null;
  #document: SyncedDocument | null = null;
  #loginStatus: LoginStatus | null = null;

  // Reactive state using Svelte 5 $state() runes
  connectionState = $state<ConnectionState>("disconnected");
  isInitialized = $state(false);
  projectUrl = $state("");
  error = $state<string | null>(null);
  devices = $state<AudiotoolDevice[]>([]);
  selectedDeviceId = $state<string | null>(null);
  selectedParameterName = $state<string | null>(null);

  // Internal devices map for quick lookups
  private _devicesMap: Map<string, AudiotoolDevice> = new Map();

  constructor(_config: Partial<AudioControllerConfig> = {}) {
    // Config not used for Audiotool, kept for interface compatibility
  }

  /**
   * Set project URL
   */
  setProjectUrl(url: string): void {
    this.projectUrl = url;
  }

  /**
   * Get the selected device
   */
  get selectedDevice(): AudiotoolDevice | null {
    if (!this.selectedDeviceId) return null;
    return this._devicesMap.get(this.selectedDeviceId) ?? null;
  }

  /**
   * Check login status and potentially trigger login
   */
  async checkLogin(): Promise<boolean> {
    try {
      console.log("[Audiotool] Checking login status...");

      if (!this.#loginStatus?.loggedIn) {
        console.log("[Audiotool] User not logged in");
        this.connectionState = "needs_login";
        return false;
      }

      console.log("[Audiotool] User is logged in");
      return true;
    } catch (error) {
      console.error("[Audiotool] Login check failed:", error);
      this.error = `Login check failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      this.connectionState = "error";
      return false;
    }
  }

  /**
   * Trigger the login flow
   */
  triggerLogin(): void {
    if (this.#loginStatus && !this.#loginStatus.loggedIn) {
      console.log("[Audiotool] Triggering login...");
      this.#loginStatus.login();
    }
  }

  /**
   * Connect to an Audiotool project
   */
  async connect(): Promise<void> {
    if (!this.projectUrl) {
      this.error = "Project URL is required";
      this.connectionState = "error";
      return;
    }

    this.connectionState = "connecting";
    this.error = null;

    // Check login status first
    console.log("[Audiotool] Checking login status...");
    this.#loginStatus = await getLoginStatus({
      clientId: import.meta.env.VITE_AT_CLIENT_ID,
      redirectUrl: "http://127.0.0.1:5173/",
      scope: "project:write",
    });

    if (!this.#loginStatus.loggedIn) {
      console.log("[Audiotool] User not logged in");
      this.connectionState = "needs_login";
      return;
    }

    console.log("[Audiotool] Creating client...");
    // Create client with the login status (OAuth authorization)
    this.#client = await createAudiotoolClient({
      authorization: this.#loginStatus,
    });
    console.log("[Audiotool] Client created successfully");

    // Create synced document config
    const docConfig = {
      mode: "online" as const,
      project: this.projectUrl,
    };
    console.log("[Audiotool] Creating synced document for:", this.projectUrl);

    // Create and start the synced document
    this.#document = await this.#client.createSyncedDocument(docConfig);
    console.log("[Audiotool] Document created, starting...");

    await this.#document.start();
    console.log("[Audiotool] Document started successfully");

    this.isInitialized = true;

    // Discover devices in the project
    console.log("[Audiotool] Discovering devices...");
    await this.discoverDevices();

    this.connectionState = "connected";
    console.log(
      "[Audiotool] Connected! Found",
      this._devicesMap.size,
      "devices"
    );
  }

  /**
   * Disconnect from the project
   */
  async disconnect(): Promise<void> {
    this.#client = null;
    this._devicesMap.clear();
    this.devices = [];
    this.selectedDeviceId = null;
    this.selectedParameterName = null;
    this.connectionState = "disconnected";
    this.error = null;
    this.isInitialized = false;
  }

  /**
   * Discover devices in the connected project
   */
  private async discoverDevices(): Promise<void> {
    if (!this.#document) return;

    this._devicesMap.clear();

    const allEntities = this.#document.queryEntities.get();
    console.log("[Audiotool] All entities in document:", allEntities.length);

    const typeCounts: Record<string, number> = {};
    for (const entity of allEntities) {
      typeCounts[entity.entityType] = (typeCounts[entity.entityType] || 0) + 1;
    }
    console.log("[Audiotool] Entity types found:", typeCounts);

    for (const entity of allEntities) {
      console.log(
        `[Audiotool] Device ${entity.entityType}:`,
        entity.id,
        entity
      );
      const device: AudiotoolDevice = {
        id: entity.id,
        type: entity.entityType,
        name: this.getDeviceName(entity.entityType, entity.id),
        parameters: this.extractParameters(entity),
      };
      console.log(
        `[Audiotool] Extracted parameters:`,
        Array.from(device.parameters.keys())
      );
      this._devicesMap.set(device.id, device);
    }
    // Update reactive devices array
    this.devices = Array.from(this._devicesMap.values());

    console.log(
      `[Audiotool] Total discovered: ${this._devicesMap.size} devices`
    );
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
   * Extract parameters from an entity by introspecting the proto fields
   */
  private extractParameters(entity: {
    fields: Record<string, unknown>;
  }): Map<string, AudiotoolParameter> {
    const params = new Map<string, AudiotoolParameter>();

    const extractFromFields = (
      fields: Record<string, unknown>,
      prefix: string = ""
    ) => {
      for (const [fieldName, field] of Object.entries(fields)) {
        // Skip non-controllable fields
        if (this.shouldSkipField(fieldName)) continue;

        const fullName = prefix ? `${prefix}.${fieldName}` : fieldName;

        if (this.isPrimitiveField(field)) {
          const value = field.value;

          // Only extract numeric parameters (controllable)
          if (typeof value === "number") {
            let min = 0;
            let max = 1;
            // NexusLocation implements SchemaLocation, safe to cast
            const schemaDetails = getSchemaLocationDetails(
              field.location as unknown as Parameters<
                typeof getSchemaLocationDetails
              >[0]
            );
            if (
              schemaDetails.type === "primitive" &&
              schemaDetails.primitive.type === "number"
            ) {
              min = schemaDetails.primitive.range.min;
              max = schemaDetails.primitive.range.max;
            }

            params.set(fullName, {
              name: fullName,
              value: value,
              min,
              max,
            });
          }
        } else if (this.isNexusObject(field)) {
          // Recursively extract from nested objects (e.g., filter, envelope)
          extractFromFields(field.fields as Record<string, unknown>, fullName);
        }
      }
    };

    extractFromFields(entity.fields);
    return params;
  }

  /**
   * Check if a field is a PrimitiveField (has value and location, but not fields)
   */
  private isPrimitiveField(
    field: unknown
  ): field is { value: unknown; location: NexusLocation } {
    return (
      field !== null &&
      typeof field === "object" &&
      "value" in field &&
      "location" in field &&
      !("fields" in field)
    );
  }

  /**
   * Check if a field is a NexusObject (nested object with fields)
   */
  private isNexusObject(
    field: unknown
  ): field is { fields: Record<string, unknown>; location: NexusLocation } {
    return (
      field !== null &&
      typeof field === "object" &&
      "fields" in field &&
      "location" in field
    );
  }

  /**
   * Fields to skip during extraction (non-controllable or internal)
   */
  private shouldSkipField(fieldName: string): boolean {
    const skipFields = [
      "displayName",
      "positionX",
      "positionY",
      "microTuning",
      "notesInput",
      "audioInput",
      "audioOutput",
      "notesOutput",
      "audioInputL",
      "audioInputR",
      "audioOutputL",
      "audioOutputR",
    ];
    return skipFields.includes(fieldName);
  }

  /**
   * Resolve a field by path (e.g., "filter.cutoffFrequencyHz")
   * Returns the PrimitiveField if found, undefined otherwise
   */
  private resolveField(
    fields: Record<string, unknown>,
    path: string
  ): PrimitiveField<number, "mut"> | undefined {
    const parts = path.split(".");
    let current: unknown = fields;

    for (const part of parts) {
      if (current === null || typeof current !== "object") {
        return undefined;
      }

      const obj = current as Record<string, unknown>;

      // Check if this is a NexusObject (has nested fields)
      if ("fields" in obj && part in (obj.fields as Record<string, unknown>)) {
        current = (obj.fields as Record<string, unknown>)[part];
      } else if (part in obj) {
        current = obj[part];
      } else {
        return undefined;
      }
    }

    // Verify it's a PrimitiveField with a numeric value
    if (
      current !== null &&
      typeof current === "object" &&
      "value" in current &&
      "location" in current &&
      typeof (current as { value: unknown }).value === "number"
    ) {
      return current as PrimitiveField<number, "mut">;
    }

    return undefined;
  }

  /**
   * Select a device for control
   */
  selectDevice(deviceId: string): void {
    if (this._devicesMap.has(deviceId)) {
      this.selectedDeviceId = deviceId;
      this.selectedParameterName = null;
    }
  }

  /**
   * Select a parameter for control
   */
  selectParameter(parameterName: string): void {
    this.selectedParameterName = parameterName;
  }

  /**
   * Set a parameter value on a device
   */
  async setParameter(
    deviceId: string,
    paramName: string,
    value: number
  ): Promise<void> {
    if (!this.#document || this.connectionState !== "connected") {
      return;
    }

    const clampedValue = Math.max(0, Math.min(1, value));
    const device = this._devicesMap.get(deviceId);
    if (!device) return;

    const mappedValue = this.mapParameterValue(paramName, clampedValue);

    // Use document.modify() to update parameters
    await this.#document.modify((t: SafeTransactionBuilder) => {
      const entity = t.entities.getEntity(deviceId);
      if (entity === undefined) return;

      // Resolve the field by traversing the path (e.g., "filter.cutoffFrequencyHz")
      const field = this.resolveField(entity.fields, paramName);
      if (field === undefined) return;

      t.update(field, mappedValue);
    });
    console.log(`[Audiotool] Set parameter ${paramName} to ${mappedValue}`);

    // Update local cache
    const param = device.parameters.get(paramName);
    if (param) {
      param.value = mappedValue;
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
    if (this.selectedDeviceId && this.selectedParameterName) {
      await this.setParameter(
        this.selectedDeviceId,
        this.selectedParameterName,
        value
      );
    }
  }

  async createPulverisateur(): Promise<void> {
    if (!this.#document || this.connectionState !== "connected") {
      return;
    }

    await this.#document.modify((t: SafeTransactionBuilder) => {
      t.create("pulverisateur", {});
    });
  }

  /**
   * Check if initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.connectionState === "connected";
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    await this.disconnect();
    this.#loginStatus = null;
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
