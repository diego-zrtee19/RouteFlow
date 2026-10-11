import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runOperations } from "@/services/operationsService";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const supplied = req.headers.get("authorization") ?? "";
  if (
    !expected ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(`Bearer ${expected}`) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(`Bearer ${expected}`))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runOperations();
    return NextResponse.json(result, {
      status: result.errors.length || result.notifications.failed ? 503 : 200,
    });
  } catch (e) {
    console.error("Operations failed", e);
    return NextResponse.json({ error: "Operations failed" }, { status: 500 });
  }
}
