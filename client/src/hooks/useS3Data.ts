import { useQuery } from "@tanstack/react-query";
import { S3Hierarchy, TaskRun } from "@shared/schema";

export function useS3Hierarchy() {
  return useQuery<S3Hierarchy>({
    queryKey: ["/api/hierarchy"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useTaskRun(date: string, taskId: string, modelName: string) {
  return useQuery<TaskRun>({
    queryKey: ["/api/task-run", date, taskId, modelName],
    enabled: !!(date && taskId && modelName),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useSearchTasks(query: string, difficulty?: string) {
  return useQuery<S3Hierarchy>({
    queryKey: ["/api/search", query, difficulty].filter(Boolean),
    enabled: query.length > 0,
  });
}
