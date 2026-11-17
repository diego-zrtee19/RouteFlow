import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const instagramCookie = "routeflow_instagram_state";
export const instagramPath = "/api/dashboard/instagram";
export const instagramSettingsPath = "/dashboard/settings";
const graph = "https://graph.facebook.com/v27.0/";

export function instagramConfig() {
  const appId = process.env.INSTAGRAM_META_APP_ID;
  const configId = process.env.INSTAGRAM_META_CONFIG_ID;
  const secret = process.env.INSTAGRAM_META_APP_SECRET;
  const callback = process.env.INSTAGRAM_OAUTH_REDIRECT_URI;
  if (!appId || !configId || !secret || !callback) return null;
  try {
    const redirect = new URL(callback);
    if (
      redirect.protocol !== "https:" ||
      redirect.pathname !== instagramPath + "/callback" ||
      redirect.search ||
      redirect.hash ||
      redirect.username ||
      redirect.password
    )
      return null;
    return { appId, configId, secret, redirect };
  } catch {
    return null;
  }
}

type Config = NonNullable<ReturnType<typeof instagramConfig>>;

function signState(state: string, sellerId: string, secret: string) {
  return createHmac("sha256", secret)
    .update(sellerId + ":" + state)
    .digest("base64url");
}

export function createInstagramLogin(config: Config, sellerId: string) {
  const state = randomBytes(32).toString("base64url");
  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.search = new URLSearchParams({
    client_id: config.appId,
    config_id: config.configId,
    redirect_uri: config.redirect.href,
    response_type: "code",
    prompt: "login",
    state,
  }).toString();
  return { url, cookie: state + "." + signState(state, sellerId, config.secret) };
}

export function validInstagramState(
  state: string | null,
  cookie: string | undefined,
  sellerId: string,
  secret: string,
) {
  if (!state || !/^[\w-]{43}$/.test(state) || !cookie) return false;
  const expected = state + "." + signState(state, sellerId, secret);
  return (
    Buffer.byteLength(cookie) === expected.length &&
    timingSafeEqual(Buffer.from(cookie), Buffer.from(expected))
  );
}

async function graphRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, graph), {
    ...options,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Meta Graph request failed");
  return response.json();
}

export async function instagramAuthorizedAccount(config: Config, code: string) {
  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.secret,
    redirect_uri: config.redirect.href,
    code,
  });
  const { access_token: token } = await graphRequest<{ access_token?: string }>(
    "oauth/access_token?" + params,
  );
  if (!token) throw new Error("Meta access token missing");

  const { data, paging } = await graphRequest<{
    data?: { id?: string; username?: string }[];
    paging?: { next?: string };
  }>("me/assigned_instagram_accounts?fields=id,username&limit=2", {
    headers: { Authorization: "Bearer " + token },
  });
  if (!Array.isArray(data) || data.length !== 1 || paging?.next) return null;
  const account = data[0];
  if (
    !account.id ||
    !/^\d{1,32}$/.test(account.id) ||
    !account.username ||
    !/^[a-zA-Z0-9_.]{1,30}$/.test(account.username)
  ) {
    throw new Error("Invalid Instagram account");
  }
  return { id: account.id, username: account.username, token };
}

export async function subscribeInstagramMessages(accountId: string, token: string) {
  const { success } = await graphRequest<{ success?: boolean }>(accountId + "/subscribed_apps", {
    method: "POST",
    body: new URLSearchParams({ subscribed_fields: "messages", access_token: token }),
  });
  if (success !== true) throw new Error("Meta subscription was not confirmed");
}
