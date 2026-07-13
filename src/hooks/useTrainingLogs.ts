import { useCallback, useEffect, useState } from "react";
import {
  createTrainingLog,
  deleteTrainingLog,
  getTrainingLogs,
  saveTrainingLog,
  type TrainingLog,
} from "../lib/localDb";

export type TrainingLogInput = Omit<TrainingLog, "id" | "load" | "updatedAt">;

export function useTrainingLogs() {
  const [logs, setLogs] = useState<TrainingLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLogs(await getTrainingLogs());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "训练日志读取失败。");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addLog = useCallback(
    async (input: TrainingLogInput) => {
      try {
        await saveTrainingLog(createTrainingLog(input));
        await reload();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "训练日志保存失败。");
      }
    },
    [reload],
  );

  const removeLog = useCallback(
    async (id: string) => {
      try {
        await deleteTrainingLog(id);
        await reload();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "训练日志删除失败。");
      }
    },
    [reload],
  );

  return { logs, error, addLog, removeLog };
}
