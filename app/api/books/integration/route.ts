import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import {
  getZohoConfig, exchangeGrant, getAccessToken, testConnection, isValidDc,
  syncContacts, syncItems, pushDocs, ALL_DOC_TYPES, pendingCounts, pullAll, autoPullIfStale, type SyncResult,
} from "@/lib/zoho";

/** Public status — never leaks the client secret or refresh token. */
async function status() {
  const cfg = await getZohoConfig();
  const pending = await pendingCounts();
  return {
    connected: !!cfg?.connected,
    dc: cfg?.dc ?? "in",
    orgId: cfg?.org_id ?? null,
    clientId: cfg?.client_id ? `${cfg.client_id.slice(0, 10)}…` : null,
    autoSync: !!cfg?.auto_sync,
    lastSync: cfg?.last_sync ?? null,
    lastPull: cfg?.last_pull ?? null,
    lastError: cfg?.last_error ?? null,
    pending,
  };
}

export async function GET(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  return NextResponse.json(await status());
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const b = await req.json().catch(() => ({}));
  const action = String(b.action || "");

  if (action === "connect") {
    const dc = String(b.dc || "in");
    const clientId = String(b.client_id || "").trim();
    const clientSecret = String(b.client_secret || "").trim();
    const orgId = String(b.org_id || "").trim();
    const grant = String(b.grant_token || "").trim();
    if (!isValidDc(dc)) return bad("Pick a valid data centre");
    if (!clientId || !clientSecret || !orgId || !grant) return bad("Client ID, Client Secret, Organization ID and Grant Token are all required");
    try {
      const refresh = await exchangeGrant(dc, clientId, clientSecret, grant, b.redirect_uri ? String(b.redirect_uri) : undefined);
      const cfg = { id: 1, dc, client_id: clientId, client_secret: clientSecret, org_id: orgId, refresh_token: refresh, connected: 0, auto_sync: 0, last_sync: null, last_error: null, last_pull: null };
      await testConnection(cfg, await getAccessToken(cfg)); // verifies token + org access
      await run(
        "UPDATE books_integration SET dc=?, client_id=?, client_secret=?, org_id=?, refresh_token=?, connected=1, last_error=NULL, last_pull=NULL, last_sync=NULL WHERE id=1",
        dc, clientId, clientSecret, orgId, refresh);
      return NextResponse.json({ ok: true, ...(await status()) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      await run("UPDATE books_integration SET last_error=? WHERE id=1", msg).catch(() => {});
      return bad(msg);
    }
  }

  if (action === "disconnect") {
    await run("UPDATE books_integration SET connected=0, auto_sync=0, refresh_token=NULL, client_secret=NULL, last_error=NULL WHERE id=1");
    return NextResponse.json({ ok: true, ...(await status()) });
  }

  if (action === "toggle_auto") {
    const cfg = await getZohoConfig();
    if (!cfg?.connected) return bad("Connect Zoho first");
    await run("UPDATE books_integration SET auto_sync = CASE WHEN auto_sync=1 THEN 0 ELSE 1 END WHERE id=1");
    return NextResponse.json({ ok: true, ...(await status()) });
  }

  if (action === "sync") {
    const cfg = await getZohoConfig();
    if (!cfg?.connected) return bad("Connect Zoho first");
    const scope = String(b.scope || "all");
    try {
      const token = await getAccessToken(cfg);
      const results: SyncResult[] = [];
      // Order matters: contacts & items must exist before documents can reference them.
      if (scope === "all" || scope === "contacts") results.push(await syncContacts(cfg, token));
      if (scope === "all" || scope === "items") results.push(await syncItems(cfg, token));
      if (scope === "all" || scope === "documents") {
        for (const dt of ALL_DOC_TYPES) {
          const res = await pushDocs(cfg, token, dt);
          if (res.pushed || res.skipped || res.errors.length) results.push(res); // only surface types that had work
        }
      }
      await run("UPDATE books_integration SET last_sync=?, last_error=NULL WHERE id=1", new Date().toISOString());
      return NextResponse.json({ ok: true, results, ...(await status()) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      await run("UPDATE books_integration SET last_error=? WHERE id=1", msg).catch(() => {});
      return bad(msg);
    }
  }

  if (action === "pull") {
    const cfg = await getZohoConfig();
    if (!cfg?.connected) return bad("Connect Zoho first");
    try {
      const results = await pullAll(cfg, await getAccessToken(cfg));
      await run("UPDATE books_integration SET last_pull=?, last_error=NULL WHERE id=1", new Date().toISOString());
      return NextResponse.json({ ok: true, results, ...(await status()) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pull failed";
      await run("UPDATE books_integration SET last_error=? WHERE id=1", msg).catch(() => {});
      return bad(msg);
    }
  }

  // Lightweight throttled background pull, fired on CRM activity. No-ops unless connected + auto-sync + stale.
  if (action === "autopull") {
    const pulled = await autoPullIfStale();
    return NextResponse.json({ ok: true, pulled });
  }

  return bad("Unknown action");
}
