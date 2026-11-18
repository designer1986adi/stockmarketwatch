import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) return unauthorized();
  const { id } = await params;
  const { error } = await db().from("stocks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
