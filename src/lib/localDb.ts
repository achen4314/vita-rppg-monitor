import type { HistoryPoint, PipelineMode } from "../hooks/useRppgPipeline";

const DB_NAME = "vita-rppg-local";
const DB_VERSION = 2;
const SESSION_STORE = "sessions";
const PROFILE_STORE = "profile";
const DEFAULT_PROFILE_ID = "default";

export interface SavedTrendPoint {
  offsetSeconds: number;
  bpm: number;
  confidence: number;
}

export interface MeasurementSession {
  id: string;
  mode: Exclude<PipelineMode, "idle">;
  startedAt: number;
  endedAt: number | null;
  updatedAt: number;
  durationSeconds: number;
  avgBpm: number | null;
  minBpm: number | null;
  maxBpm: number | null;
  avgConfidence: number;
  lastSnrDb: number;
  pointCount: number;
  points: SavedTrendPoint[];
}

export interface PersonalProfile {
  id: typeof DEFAULT_PROFILE_ID;
  displayName: string;
  age: number | null;
  sex: "unspecified" | "female" | "male" | "other";
  primarySport: string;
  trainingGoal: "general" | "fat_loss" | "endurance" | "performance" | "recovery";
  weeklySessions: number | null;
  notes: string;
  updatedAt: number;
}

export const DEFAULT_PROFILE: PersonalProfile = {
  id: DEFAULT_PROFILE_ID,
  displayName: "",
  age: null,
  sex: "unspecified",
  primarySport: "",
  trainingGoal: "general",
  weeklySessions: null,
  notes: "",
  updatedAt: Date.now(),
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const store = db.createObjectStore(SESSION_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("startedAt", "startedAt");
      }
      if (!db.objectStoreNames.contains(PROFILE_STORE)) {
        db.createObjectStore(PROFILE_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(
  storeName: typeof SESSION_STORE | typeof PROFILE_STORE,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = callback(store);
        let result: T | undefined;

        if (request) {
          request.onsuccess = () => {
            result = request.result;
          };
          request.onerror = () => reject(request.error);
        }

        transaction.oncomplete = () => {
          db.close();
          resolve(result);
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      }),
  );
}

export function createSession(mode: Exclude<PipelineMode, "idle">): MeasurementSession {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    mode,
    startedAt: Date.now(),
    endedAt: null,
    updatedAt: Date.now(),
    durationSeconds: 0,
    avgBpm: null,
    minBpm: null,
    maxBpm: null,
    avgConfidence: 0,
    lastSnrDb: 0,
    pointCount: 0,
    points: [],
  };
}

export function summarizeSession(
  session: MeasurementSession,
  history: readonly HistoryPoint[],
  durationSeconds: number,
  snrDb: number,
  endedAt: number | null,
): MeasurementSession {
  const firstT = history[0]?.t ?? 0;
  const points = history.map((point) => ({
    offsetSeconds: firstT ? Math.max(0, (point.t - firstT) / 1000) : 0,
    bpm: Number(point.bpm.toFixed(2)),
    confidence: Number(point.confidence.toFixed(3)),
  }));
  const bpms = points.map((point) => point.bpm);
  const confidences = points.map((point) => point.confidence);
  const avg = (values: readonly number[]) =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    ...session,
    endedAt,
    updatedAt: Date.now(),
    durationSeconds: Number(durationSeconds.toFixed(1)),
    avgBpm: bpms.length ? Number(avg(bpms).toFixed(1)) : null,
    minBpm: bpms.length ? Number(Math.min(...bpms).toFixed(1)) : null,
    maxBpm: bpms.length ? Number(Math.max(...bpms).toFixed(1)) : null,
    avgConfidence: Number(avg(confidences).toFixed(3)),
    lastSnrDb: Number(snrDb.toFixed(1)),
    pointCount: points.length,
    points,
  };
}

export async function saveSession(session: MeasurementSession): Promise<void> {
  await withStore(SESSION_STORE, "readwrite", (store) => store.put(session));
}

export async function getSessions(): Promise<MeasurementSession[]> {
  const sessions = (await withStore<MeasurementSession[]>(SESSION_STORE, "readonly", (store) => store.getAll())) ?? [];
  return sessions.sort((a, b) => b.startedAt - a.startedAt);
}

export async function clearSessions(): Promise<void> {
  await withStore(SESSION_STORE, "readwrite", (store) => store.clear());
}

export async function getProfile(): Promise<PersonalProfile> {
  const profile = await withStore<PersonalProfile>(PROFILE_STORE, "readonly", (store) => store.get(DEFAULT_PROFILE_ID));
  return profile ?? DEFAULT_PROFILE;
}

export async function saveProfile(profile: PersonalProfile): Promise<void> {
  await withStore(PROFILE_STORE, "readwrite", (store) =>
    store.put({
      ...profile,
      id: DEFAULT_PROFILE_ID,
      updatedAt: Date.now(),
    }),
  );
}

export async function exportSessionsJson(): Promise<string> {
  const sessions = await getSessions();
  const profile = await getProfile();
  return JSON.stringify(
    {
      app: "VITA.IO rPPG Monitor",
      exportedAt: new Date().toISOString(),
      profile,
      sessions,
    },
    null,
    2,
  );
}
