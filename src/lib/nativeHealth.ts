import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativeHealthStatus {
  available: boolean;
  needsProviderUpdate: boolean;
  authorized: boolean;
  grantedCount: number;
  requiredCount: number;
}

export interface NativeHealthMeasurement {
  bpm: number;
  timestamp: number;
  rmssd?: number;
  respiratoryRate?: number;
}

interface VitaHealthPlugin {
  getStatus(): Promise<NativeHealthStatus>;
  requestHealthPermissions(): Promise<NativeHealthStatus>;
  writeMeasurement(measurement: NativeHealthMeasurement): Promise<{ written: number }>;
}

const VitaHealth = registerPlugin<VitaHealthPlugin>("VitaHealth");

export function getNativeHealthPlatform(): "android" | "ios" | "web" {
  const platform = Capacitor.getPlatform();
  if (platform === "android" || platform === "ios") return platform;
  return "web";
}

export async function getNativeHealthStatus(): Promise<NativeHealthStatus> {
  return VitaHealth.getStatus();
}

export async function requestNativeHealthPermissions(): Promise<NativeHealthStatus> {
  return VitaHealth.requestHealthPermissions();
}

export async function writeNativeHealthMeasurement(measurement: NativeHealthMeasurement): Promise<number> {
  const result = await VitaHealth.writeMeasurement(measurement);
  return result.written;
}
