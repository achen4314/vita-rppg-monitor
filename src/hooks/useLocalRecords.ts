import { useCallback, useEffect, useRef, useState } from "react";
import type { PipelineState } from "./useRppgPipeline";
import {
  clearSessions,
  createSession,
  exportSessionsJson,
  exportSessionsCsv,
  getSessions,
  saveSession,
  summarizeSession,
  DEFAULT_CHECK_IN,
  type AthleteCheckIn,
  type MeasurementSession,
  type MeasurementContext,
} from "../lib/localDb";

export function useLocalRecords(
  state: PipelineState,
  measurementContext: MeasurementContext = "general",
  checkIn: AthleteCheckIn = DEFAULT_CHECK_IN,
) {
  const [sessions, setSessions] = useState<MeasurementSession[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const activeSessionRef = useRef<MeasurementSession | null>(null);
  const lastSavedPointCountRef = useRef(0);

  const reload = useCallback(async () => {
    try {
      setSessions(await getSessions());
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "本地数据库读取失败。");
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await clearSessions();
      activeSessionRef.current = null;
      lastSavedPointCountRef.current = 0;
      await reload();
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "本地数据库清理失败。");
    }
  }, [reload]);

  const exportJson = useCallback(async () => {
    const json = await exportSessionsJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vita-rppg-records-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportCsv = useCallback(async () => {
    const csv = await exportSessionsCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vita-rppg-records-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (state.running && (state.mode === "camera" || state.mode === "demo") && !activeSessionRef.current) {
      const mode = state.mode;
      activeSessionRef.current = createSession(mode, measurementContext, checkIn);
      lastSavedPointCountRef.current = 0;
    }

    if (!state.running && activeSessionRef.current) {
      const activeSession = activeSessionRef.current;
      const finalDurationSeconds = Math.max(state.elapsedSeconds, activeSession.durationSeconds);
      const finalSnrDb = activeSession.pointCount > 0 ? activeSession.lastSnrDb : state.snrDb;
      const finalRespirationRate = state.respirationRate ?? activeSession.avgRespirationRate;
      const finalRespirationConfidence = Math.max(state.respirationConfidence, activeSession.respirationConfidence ?? 0);
      const finalHrv = state.hrv ?? activeSession.hrv ?? null;
      const finalized = summarizeSession(
        activeSession,
        state.history,
        finalDurationSeconds,
        finalSnrDb,
        Date.now(),
        finalRespirationRate,
        finalRespirationConfidence,
        finalHrv,
      );
      activeSessionRef.current = null;
      lastSavedPointCountRef.current = 0;
      if (finalized.pointCount > 0) {
        void saveSession(finalized)
          .then(reload)
          .catch((error) => setStorageError(error instanceof Error ? error.message : "本地数据库保存失败。"));
      }
    }
  }, [
    checkIn,
    measurementContext,
    reload,
    state.elapsedSeconds,
    state.history,
    state.hrv,
    state.mode,
    state.respirationConfidence,
    state.respirationRate,
    state.running,
    state.snrDb,
  ]);

  useEffect(() => {
    if (!activeSessionRef.current || state.history.length === 0) return;
    if (state.history.length === lastSavedPointCountRef.current) return;

    const updated = summarizeSession(
      activeSessionRef.current,
      state.history,
      state.elapsedSeconds,
      state.snrDb,
      null,
      state.respirationRate,
      state.respirationConfidence,
      state.hrv,
    );
    activeSessionRef.current = updated;
    lastSavedPointCountRef.current = state.history.length;

    void saveSession(updated)
      .then(reload)
      .catch((error) => setStorageError(error instanceof Error ? error.message : "本地数据库保存失败。"));
  }, [reload, state.elapsedSeconds, state.history, state.hrv, state.respirationConfidence, state.respirationRate, state.snrDb]);

  return {
    sessions,
    storageError,
    reload,
    clearAll,
    exportJson,
    exportCsv,
  };
}
