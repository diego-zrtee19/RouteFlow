import { financeUuid } from "./financeLedger";
export type SellerTask = {
  id: string;
  title: string;
  detail: string;
  due_at: string | null;
  done: boolean;
  revision: number;
  updated_at: string;
};
export type TaskActivity = {
  id: number;
  task_id: string;
  action: "created" | "completed" | "reopened";
  created_at: string;
  revision: number;
};
export function parseTask(body: Record<string, unknown>) {
  if (body.action === "state") {
    if (
      typeof body.taskId !== "string" ||
      !financeUuid.test(body.taskId) ||
      !Number.isSafeInteger(body.revision) ||
      Number(body.revision) < 1 ||
      typeof body.done !== "boolean"
    )
      return null;
    return {
      action: "state" as const,
      taskId: body.taskId,
      revision: Number(body.revision),
      done: body.done,
    };
  }
  if (
    body.action !== "create" ||
    typeof body.clientId !== "string" ||
    !financeUuid.test(body.clientId) ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.length > 200 ||
    typeof body.detail !== "string" ||
    body.detail.length > 2000 ||
    (body.title + body.detail).includes("\0") ||
    (body.dueAt !== null &&
      (typeof body.dueAt !== "string" ||
        body.dueAt.length > 64 ||
        !Number.isFinite(Date.parse(body.dueAt))))
  )
    return null;
  return {
    action: "create" as const,
    clientId: body.clientId,
    title: body.title.trim(),
    detail: body.detail,
    dueAt: body.dueAt === null ? null : new Date(body.dueAt as string).toISOString(),
  };
}
