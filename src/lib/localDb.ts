import type { HistoryPoint, PipelineMode } from "../hooks/useRppgPipeline";
import type { HRVMetrics } from "./pos";

const DB_NAME = "vita-rppg-local";
const DB_VERSION = 3;
const SESSION_STORE = "sessions";
const PROFILE_STORE = "profile";
const DEFAULT_PROFILE_ID = "default";

export interface SavedTrendPoint {
  offsetSeconds: number;
  bpm: number;
  confidence: number;
}

export type MeasurementContext = "general" | "morning" | "post_exercise" | "sleep_prep";

export interface AthleteCheckIn {
  rpe: number | null;
  sleepQuality: number | null;
  willingness: "high" | "medium" | "low" | null;
  note: string;
}

export const DEFAULT_CHECK_IN: AthleteCheckIn = {
  rpe: null,
  sleepQuality: null,
  willingness: null,
  note: "",
};

export interface MeasurementSession {
  id: string;
  mode: Exclude<PipelineMode, "idle">;
  context: MeasurementContext;
  checkIn: AthleteCheckIn;
  startedAt: number;
  endedAt: number | null;
  updatedAt: number;
  durationSeconds: number;
  avgBpm: number | null;
  minBpm: number | null;
  maxBpm: number | null;
  avgConfidence: number;
  lastSnrDb: number;
  avgRespirationRate: number | null;
  respirationConfidence: number;
  hrv: HRVMetrics | null;
  bestWindowSeconds: number;
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

export function createSession(
  mode: Exclude<PipelineMode, "idle">,
  context: MeasurementContext,
  checkIn: AthleteCheckIn,
): MeasurementSession {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    mode,
    context,
    checkIn,
    startedAt: Date.now(),
    endedAt: null,
    updatedAt: Date.now(),
    durationSeconds: 0,
    avgBpm: null,
    minBpm: null,
    maxBpm: null,
    avgConfidence: 0,
    lastSnrDb: 0,
    avgRespirationRate: null,
    respirationConfidence: 0,
    hrv: null,
    bestWindowSeconds: 0,
    pointCount: 0,
    points: [],
  };
}

function selectBestWindow(points: readonly SavedTrendPoint[], targetSeconds = 10): SavedTrendPoint[] {
  if (points.length < 5) return [...points];

  let bestPoints: SavedTrendPoint[] = [];
  let bestScore = -Infinity;

  for (let start = 0; start < points.length; start += 1) {
    const startOffset = points[start].offsetSeconds;
    const windowPoints = points.filter(
      (point) => point.offsetSeconds >= startOffset && point.offsetSeconds <= startOffset + targetSeconds,
    );
    if (windowPoints.length < 5) continue;

    const bpms = windowPoints.map((point) => point.bpm);
    const confidences = windowPoints.map((point) => point.confidence);
    const avgConfidence = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
    const bpmMean = bpms.reduce((sum, value) => sum + value, 0) / bpms.length;
    const variance = bpms.reduce((sum, value) => sum + (value - bpmMean) ** 2, 0) / bpms.length;
    const score = avgConfidence * 100 - Math.sqrt(variance) * 2 + Math.min(windowPoints.length, targetSeconds) * 0.4;

    if (score > bestScore) {
      bestScore = score;
      bestPoints = windowPoints;
    }
  }

  return bestPoints.length ? bestPoints : [...points];
}

export function summarizeSession(
  session: MeasurementSession,
  history: readonly HistoryPoint[],
  durationSeconds: number,
  snrDb: number,
  endedAt: number | null,
  respirationRate: number | null = null,
  respirationConfidence = 0,
  hrv: HRVMetrics | null = null,
): MeasurementSession {
  const firstT = history[0]?.t ?? 0;
  const points = history.map((point) => ({
    offsetSeconds: firstT ? Math.max(0, (point.t - firstT) / 1000) : 0,
    bpm: Number(point.bpm.toFixed(2)),
    confidence: Number(point.confidence.toFixed(3)),
  }));
  const bestPoints = selectBestWindow(points);
  const bpms = bestPoints.map((point) => point.bpm);
  const confidences = bestPoints.map((point) => point.confidence);
  const avg = (values: readonly number[]) =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  const bestWindowSeconds =
    bestPoints.length > 1
      ? Number((bestPoints[bestPoints.length - 1].offsetSeconds - bestPoints[0].offsetSeconds).toFixed(1))
      : 0;

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
    avgRespirationRate: respirationRate === null ? session.avgRespirationRate : Number(respirationRate.toFixed(1)),
    respirationConfidence: Number(Math.max(session.respirationConfidence ?? 0, respirationConfidence).toFixed(3)),
    hrv: hrv ?? session.hrv ?? null,
    bestWindowSeconds,
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

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportSessionsCsv(): Promise<string> {
  const sessions = await getSessions();
  const header = [
    "session_id",
    "context",
    "mode",
    "started_at",
    "duration_seconds",
    "avg_bpm",
    "min_bpm",
    "max_bpm",
    "avg_respiration_rate",
    "rmssd",
    "sdnn",
    "pnn50",
    "stress_index",
    "avg_confidence",
    "snr_db",
    "rpe",
    "sleep_quality",
    "willingness",
    "point_offset_seconds",
    "point_bpm",
    "point_confidence",
  ];
  const rows = sessions.flatMap((session) => {
    const base = [
      session.id,
      session.context ?? "general",
      session.mode,
      new Date(session.startedAt).toISOString(),
      session.durationSeconds,
      session.avgBpm,
      session.minBpm,
      session.maxBpm,
      session.avgRespirationRate,
      session.hrv?.rmssd,
      session.hrv?.sdnn,
      session.hrv?.pnn50,
      session.hrv?.stressIndex,
      session.avgConfidence,
      session.lastSnrDb,
      session.checkIn?.rpe,
      session.checkIn?.sleepQuality,
      session.checkIn?.willingness,
    ];

    if (session.points.length === 0) {
      return [[...base, "", "", ""]];
    }

    return session.points.map((point) => [...base, point.offsetSeconds, point.bpm, point.confidence]);
  });

  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}
