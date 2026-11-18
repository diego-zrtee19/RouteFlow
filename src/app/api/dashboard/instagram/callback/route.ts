import { NextRequest, NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { encryptInstagramToken, instagramReplyKey } from "@/services/instagramMessaging";
import {
  instagramAuthorizedAccount,
  instagramConfig,
  instagramCookie,
  instagramPath,
  instagramSettingsPath,
  subscribeInstagramMessages,
  validInstagramState,
} from "@/services/instagramConnection";

export async function GET(request: NextRequest) {
  const config = instagramConfig();
  const destination = new URL(instagramSettingsPath, config?.redirect ?? request.nextUrl);
  function finish(status: string) {
    destination.searchParams.set("instagram", status);
    const response = NextResponse.redirect(destination, 303);
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(instagramCookie, "", { path: instagramPath, maxAge: 0 });
    return response;
  }

  const seller = await requireSeller();
  if (!config || !seller.ok) return finish("restart");
  const params = request.nextUrl.searchParams;
  if (
    !validInstagramState(
      params.get("state"),
      request.cookies.get(instagramCookie)?.value,
      seller.value.id,
      config.secret,
    )
  ) {
    return finish("restart");
  }
  const code = params.get("code");
  if (!code) return finish("cancelled");

  try {
    const account = await instagramAuthorizedAccount(config, code);
    if (!account) return finish("select-one");
    const admin = getSupabaseAdmin();

    const { data: existing, error: existingError } = await admin
      .from("seller_instagram_connections")
      .select("id, instagram_account_id, connected_at")
      .eq("seller_id", seller.value.id)
      .not("connected_at", "is", null)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (existing.instagram_account_id !== account.id) return finish("already-linked");
      await subscribeInstagramMessages(account.id, account.token);
      if (instagramReplyKey()) {
        const { error: credentialError } = await admin
          .from("seller_instagram_connections")
          .update({
            token_ciphertext: encryptInstagramToken(account.token, existing.id),
            token_config_id: config.configId,
          })
          .eq("id", existing.id)
          .eq("seller_id", seller.value.id);
        if (credentialError) throw credentialError;
      }
      return finish("connected");
    }

    // Discard an abandoned, unfinished attempt before reserving the account.
    const { error: cleanupError } = await admin
      .from("seller_instagram_connections")
      .delete()
      .eq("seller_id", seller.value.id)
      .is("connected_at", null)
      .lt("created_at", new Date(Date.now() - 60_000).toISOString());
    if (cleanupError) throw cleanupError;

    const { data: connection, error } = await admin
      .from("seller_instagram_connections")
      .insert({
        seller_id: seller.value.id,
        instagram_account_id: account.id,
        username: account.username,
      })
      .select("id")
      .single();
    if (error?.code === "23505") return finish("already-linked");
    if (error || !connection) throw new Error("Instagram connection could not be reserved");

    try {
      await subscribeInstagramMessages(account.id, account.token);
      const { data: active, error: activateError } = await admin
        .from("seller_instagram_connections")
        .update({
          connected_at: new Date().toISOString(),
          ...(instagramReplyKey()
            ? {
                token_ciphertext: encryptInstagramToken(account.token, connection.id),
                token_config_id: config.configId,
              }
            : {}),
        })
        .eq("id", connection.id)
        .select("id")
        .maybeSingle();
      if (activateError || !active) throw new Error("Instagram connection could not be activated");
      return finish("connected");
    } catch {
      await admin
        .from("seller_instagram_connections")
        .delete()
        .eq("id", connection.id)
        .is("connected_at", null);
      return finish("failed");
    }
  } catch {
    return finish("failed");
  }
}
