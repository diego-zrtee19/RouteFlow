import { beforeEach, expect, it, vi } from "vitest";
import { parseTask } from "@/domain/sellerTasks";
const mocks = vi.hoisted(() => ({ seller: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireSeller: mocks.seller }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: () => ({ rpc: mocks.rpc }) }));
import { GET, POST } from "@/app/api/dashboard/tasks/route";
const id = "00000000-0000-0000-0000-000000000001";
const url = "https://routeflow.test/api/dashboard/tasks";
beforeEach(() => vi.resetAllMocks());
it("validates a task and normalizes its date without accepting invalid content", () => {
  expect(
    parseTask({
      action: "create",
      clientId: id,
      title: " Revisar empaque ",
      detail: "",
      dueAt: "2026-11-28T09:00:00-06:00",
    }),
  ).toMatchObject({ title: "Revisar empaque", dueAt: "2026-11-28T15:00:00.000Z" });
  for (const patch of [
    { title: " " },
    { dueAt: "not a date" },
    { title: "x".repeat(201) },
    { detail: "x\0" },
  ])
    expect(
      parseTask({
        action: "create",
        clientId: id,
        title: "Valid",
        detail: "",
        dueAt: null,
        ...patch,
      }),
    ).toBeNull();
  expect(parseTask({ action: "state", taskId: id, revision: 1, done: false })).not.toBeNull();
  expect(parseTask({ action: "state", taskId: id, revision: 0, done: true })).toBeNull();
});
it("requires authentication before exposing tasks or their history", async () => {
  mocks.seller.mockResolvedValue({ ok: false, code: "UNAUTHENTICATED", status: 401 });
  expect((await GET()).status).toBe(401);
  expect((await POST(new Request(url, { method: "POST" }))).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects cross-origin writes", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner", userId: "actor" } });
  expect(
    (await POST(new Request(url, { method: "POST", headers: { origin: "https://other.test" } })))
      .status,
  ).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("uses the session seller and actor for creation, ignoring caller identity", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner", userId: "actor" } });
  mocks.rpc.mockResolvedValue({ data: { id, duplicate: true }, error: null });
  const res = await POST(
    new Request(url, {
      method: "POST",
      headers: { origin: "https://routeflow.test" },
      body: JSON.stringify({
        action: "create",
        clientId: id,
        title: "Task",
        detail: "Notes",
        dueAt: null,
        sellerId: "other",
        actor: "other",
      }),
    }),
  );
  expect(res.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("create_seller_task", {
    p_seller: "owner",
    p_actor: "actor",
    p_client: id,
    p_title: "Task",
    p_detail: "Notes",
    p_due: null,
  });
  expect(res.headers.get("Cache-Control")).toContain("no-store");
});
it("returns a conflict for a stale or unowned task instead of reporting success", async () => {
  mocks.seller.mockResolvedValue({ ok: true, value: { id: "owner", userId: "actor" } });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  const res = await POST(
    new Request(url, {
      method: "POST",
      headers: { origin: "https://routeflow.test" },
      body: JSON.stringify({ action: "state", taskId: id, revision: 1, done: true }),
    }),
  );
  expect(res.status).toBe(409);
  expect(mocks.rpc).toHaveBeenCalledWith("set_seller_task_done", {
    p_seller: "owner",
    p_actor: "actor",
    p_task: id,
    p_revision: 1,
    p_done: true,
  });
});
