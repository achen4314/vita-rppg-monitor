import { useCallback, useEffect, useRef, useState } from "react";
import type { PipelineState } from "./useRppgPipeline";
import {
  clearSessions,
  createSession,
  exportSessionsJson,
  getSessions,
  saveSession,
  summarizeSession,
  type MeasurementSession,
} from "../lib/localDb";

export function useLocalRecords(state: PipelineState) {
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

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (state.running && (state.mode === "camera" || state.mode === "demo") && !activeSessionRef.current) {
      const mode = state.mode;
      activeSessionRef.current = createSession(mode);
      lastSavedPointCountRef.current = 0;
    }

    if (!state.running && activeSessionRef.current) {
      const finalized = summarizeSession(
        activeSessionRef.current,
        state.history,
        state.elapsedSeconds,
        state.snrDb,
        Date.now(),
      );
      activeSessionRef.current = null;
      lastSavedPointCountRef.current = 0;
      if (finalized.pointCount > 0) {
        void saveSession(finalized)
          .then(reload)
          .catch((error) => setStorageError(error instanceof Error ? error.message : "本地数据库保存失败。"));
      }
    }
  }, [reload, state.elapsedSeconds, state.history, state.mode, state.running, state.snrDb]);

  useEffect(() => {
    if (!activeSessionRef.current || state.history.length === 0) return;
    if (state.history.length === lastSavedPointCountRef.current) return;

    const updated = summarizeSession(
      activeSessionRef.current,
      state.history,
      state.elapsedSeconds,
      state.snrDb,
      null,
    );
    activeSessionRef.current = updated;
    lastSavedPointCountRef.current = state.history.length;

    void saveSession(updated)
      .then(reload)
      .catch((error) => setStorageError(error instanceof Error ? error.message : "本地数据库保存失败。"));
  }, [reload, state.elapsedSeconds, state.history, state.snrDb]);

  return {
    sessions,
    storageError,
    reload,
    clearAll,
    exportJson,
  };
}
