import { get, all, run } from "./db";

/* ------------------------------------------------------------------ *
 * Zoho Books integration — OAuth token engine + one-way push sync.
 * Single-org config lives in the books_integration table (id = 1).
 * All network calls happen server-side only; secrets never reach the client.
 * Docs: accounts.zoho.<dc>/oauth/v2/token  ·  www.zohoapis.<dc>/books/v3
 * ------------------------------------------------------------------ */

export type ZohoConfig = {
  id: number; dc: string;
  client_id: string | null; client_secret: string | null; org_id: string | null;
  refresh_token: string | null;
  connected: number; auto_sync: number;
  last_sync: string | null; last_error: string | null; last_pull: string | null;
};

export type SyncResult = { entity: string; pushed: number; skipped: number; errors: string[] };

const DCS = ["in", "com", "eu", "com.au", "jp", "ca", "sa", "com.cn"];
export const isValidDc = (dc: unknown): dc is string => typeof dc === "string" && DCS.includes(dc);

const accountsBase = (dc: string) => `https://accounts.zoho.${dc}`;
const apiBase = (dc: string) => `https://www.zohoapis.${dc}/books/v3`;

export async function getZohoConfig(): Promise<ZohoConfig | undefined> {
  return get<ZohoConfig>("SELECT * FROM books_integration WHERE id = 1");
}

/** Exchange a Self-Client / authorization grant token for a long-lived refresh token (one-time). */
export async function exchangeGrant(dc: string, clientId: string, clientSecret: string, code: string, redirectUri?: string): Promise<string> {
  const params = new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code });
  if (redirectUri) params.set("redirect_uri", redirectUri);
  const res = await fetch(`${accountsBase(dc)}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const j = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!j.refresh_token) {
    throw new Error(String(j.error || "No refresh token returned — the grant token may be expired (valid ~3 min) or the scopes/secret are wrong."));
  }
  return String(j.refresh_token);
}

/** Mint a fresh 1-hour access token from the stored refresh token. */
export async function getAccessToken(cfg: ZohoConfig): Promise<string> {
  if (!cfg.refresh_token || !cfg.client_id || !cfg.client_secret) throw new Error("Zoho is not connected");
  const params = new URLSearchParams({
    grant_type: "refresh_token", refresh_token: cfg.refresh_token, client_id: cfg.client_id, client_secret: cfg.client_secret,
  });
  const res = await fetch(`${accountsBase(cfg.dc)}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const j = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!j.access_token) throw new Error(String(j.error || "Could not refresh the Zoho access token"));
  return String(j.access_token);
}

/** Authenticated Zoho Books API call. Throws on a non-zero Zoho `code`. */
async function zfetch(cfg: ZohoConfig, token: string, method: string, pathName: string, body?: unknown): Promise<Record<string, unknown>> {
  const sep = pathName.includes("?") ? "&" : "?";
  const url = `${apiBase(cfg.dc)}/${pathName}${sep}organization_id=${cfg.org_id}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({} as Record<string, unknown>));
  // Zoho Books envelope: { code: 0, message: "success", <entity>: {...} }
  if (typeof j.code === "number" && j.code !== 0) throw new Error(`Zoho: ${j.message || "request failed"} (code ${j.code})`);
  if (!res.ok && j.code == null) throw new Error(`Zoho HTTP ${res.status}`);
  return j;
}

/** Verify credentials + org access with one cheap call (used right after connecting). */
export async function testConnection(cfg: ZohoConfig, token: string): Promise<void> {
  await zfetch(cfg, token, "GET", "contacts?per_page=1");
}

type Party = { id: number; type: string; name: string; company: string | null; email: string | null; phone: string | null; gstin: string | null; billing_address: string | null };
type Item = { id: number; name: string; sku: string | null; type: string; rate: number; tax_rate: number };
type Txn = { id: number; number: string; txn_date: string; due_date: string | null; notes: string | null; party_zoho: string };
type Line = { name: string; qty: number; rate: number; tax_rate: number };

/** Push local customers/vendors that don't yet exist in Zoho. */
export async function syncContacts(cfg: ZohoConfig, token: string): Promise<SyncResult> {
  const rows = await all<Party>("SELECT id, type, name, company, email, phone, gstin, billing_address FROM books_parties WHERE zoho_id IS NULL");
  const r: SyncResult = { entity: "Contacts", pushed: 0, skipped: 0, errors: [] };
  for (const p of rows) {
    try {
      const body: Record<string, unknown> = {
        contact_name: p.name,
        contact_type: p.type === "vendor" ? "vendor" : "customer",
        customer_sub_type: "business",
      };
      if (p.company) body.company_name = p.company;
      // NOTE: gst_no is intentionally NOT sent — Zoho rejects it ("Invalid Element gst_no")
      // unless the org has GST enabled with a matching place_of_contact. Contacts must sync
      // reliably first; GST mapping can be layered on once the org's GST setup is confirmed.
      if (p.billing_address) body.billing_address = { address: p.billing_address };
      if (p.email || p.phone) body.contact_persons = [{ email: p.email || undefined, phone: p.phone || undefined, is_primary_contact: true }];
      const j = await zfetch(cfg, token, "POST", "contacts", body);
      const zid = (j.contact as { contact_id?: string } | undefined)?.contact_id;
      if (zid) { await run("UPDATE books_parties SET zoho_id = ? WHERE id = ?", String(zid), p.id); r.pushed++; }
      else r.errors.push(`${p.name}: no contact_id in response`);
    } catch (e) { r.errors.push(`${p.name}: ${e instanceof Error ? e.message : "failed"}`); }
  }
  return r;
}

/** Push local items (goods/services) that don't yet exist in Zoho. */
export async function syncItems(cfg: ZohoConfig, token: string): Promise<SyncResult> {
  const rows = await all<Item>("SELECT id, name, sku, type, rate, tax_rate FROM books_items WHERE zoho_id IS NULL AND active = 1");
  const r: SyncResult = { entity: "Items", pushed: 0, skipped: 0, errors: [] };
  for (const it of rows) {
    try {
      const body: Record<string, unknown> = {
        name: it.name,
        rate: it.rate,
        product_type: it.type === "goods" ? "goods" : "service",
      };
      if (it.sku) body.sku = it.sku;
      const j = await zfetch(cfg, token, "POST", "items", body);
      const zid = (j.item as { item_id?: string } | undefined)?.item_id;
      if (zid) { await run("UPDATE books_items SET zoho_id = ? WHERE id = ?", String(zid), it.id); r.pushed++; }
      else r.errors.push(`${it.name}: no item_id in response`);
    } catch (e) { r.errors.push(`${it.name}: ${e instanceof Error ? e.message : "failed"}`); }
  }
  return r;
}

/** Maps each NexusHR document type to its Zoho Books endpoint, response key, id field and party field. */
const ZOHO_DOC: Record<string, { entity: string; key: string; idField: string; party: "customer_id" | "vendor_id"; label: string; numberField?: string }> = {
  quote:          { entity: "estimates",      key: "estimate",      idField: "estimate_id",      party: "customer_id", label: "Quotations" },
  sales_order:    { entity: "salesorders",    key: "salesorder",    idField: "salesorder_id",    party: "customer_id", label: "Sales Orders" },
  invoice:        { entity: "invoices",       key: "invoice",       idField: "invoice_id",       party: "customer_id", label: "Invoices" },
  credit_note:    { entity: "creditnotes",    key: "creditnote",    idField: "creditnote_id",    party: "customer_id", label: "Credit Notes" },
  purchase_order: { entity: "purchaseorders", key: "purchaseorder", idField: "purchaseorder_id", party: "vendor_id",   label: "Purchase Orders" },
  bill:           { entity: "bills",          key: "bill",          idField: "bill_id",          party: "vendor_id",   label: "Bills", numberField: "bill_number" },
  vendor_credit:  { entity: "vendorcredits",  key: "vendor_credit", idField: "vendor_credit_id", party: "vendor_id",   label: "Vendor Credits" },
};
export const isZohoDoc = (type: string) => type in ZOHO_DOC;

/** Push any document type (quote→estimate, SO, invoice, credit note, PO, bill, vendor credit) whose party is already in Zoho. */
export async function pushDocs(cfg: ZohoConfig, token: string, type: string): Promise<SyncResult> {
  const meta = ZOHO_DOC[type];
  const r: SyncResult = { entity: meta?.label || type, pushed: 0, skipped: 0, errors: [] };
  if (!meta) return r;
  const rows = await all<Txn>(
    `SELECT t.id, t.number, t.txn_date, t.due_date, t.notes, p.zoho_id AS party_zoho
     FROM books_txns t JOIN books_parties p ON p.id = t.party_id
     WHERE t.type = ? AND t.zoho_id IS NULL AND p.zoho_id IS NOT NULL`, type);
  const pending = await get<{ c: number }>(
    `SELECT COUNT(*) c FROM books_txns t JOIN books_parties p ON p.id = t.party_id
     WHERE t.type = ? AND t.zoho_id IS NULL AND p.zoho_id IS NULL`, type);
  r.skipped = pending?.c ?? 0;
  if (rows.length === 0) return r;

  // Best-effort GST mapping: pull the org's configured taxes once, match by percentage → tax_id.
  const taxMap = new Map<number, string>();
  try {
    const tj = await zfetch(cfg, token, "GET", "settings/taxes");
    for (const tx of (tj.taxes as { tax_id?: string; tax_percentage?: number }[] | undefined) || []) {
      if (typeof tx.tax_percentage === "number" && tx.tax_id) taxMap.set(tx.tax_percentage, tx.tax_id);
    }
  } catch { /* taxes unavailable — push without tax */ }

  for (const t of rows) {
    try {
      const lines = await all<Line>("SELECT name, qty, rate, tax_rate FROM books_txn_lines WHERE txn_id = ?", t.id);
      const body: Record<string, unknown> = {
        [meta.party]: t.party_zoho,
        reference_number: t.number, // keep our number visible; Zoho assigns its own document number
        date: t.txn_date,
        line_items: lines.map((l) => {
          const li: Record<string, unknown> = { name: l.name, description: l.name, rate: l.rate, quantity: l.qty };
          const tid = taxMap.get(l.tax_rate);
          if (tid) li.tax_id = tid;
          return li;
        }),
      };
      // Only invoices & bills accept due_date in Zoho; estimates/SO/PO/credit-notes reject it (would fail the whole push).
      if (t.due_date && (type === "invoice" || type === "bill")) body.due_date = t.due_date;
      if (t.notes) body.notes = t.notes;
      if (meta.numberField) body[meta.numberField] = t.number; // bills require a vendor bill number
      const j = await zfetch(cfg, token, "POST", meta.entity, body);
      const zid = (j[meta.key] as Record<string, unknown> | undefined)?.[meta.idField];
      if (zid) { await run("UPDATE books_txns SET zoho_id = ? WHERE id = ?", String(zid), t.id); r.pushed++; }
      else r.errors.push(`${t.number}: no ${meta.idField} in response`);
    } catch (e) { r.errors.push(`${t.number}: ${e instanceof Error ? e.message : "failed"}`); }
  }
  return r;
}

/** All NexusHR document types in safe push order (customer side first, then vendor side). */
export const ALL_DOC_TYPES = ["quote", "sales_order", "invoice", "credit_note", "purchase_order", "bill", "vendor_credit"];

/** Back-compat wrapper. */
export async function syncInvoices(cfg: ZohoConfig, token: string): Promise<SyncResult> {
  return pushDocs(cfg, token, "invoice");
}

/**
 * Auto-sync hook — call right after a record is created so it flows to Zoho with no manual step.
 * Best-effort: returns silently if not connected / auto-sync off, and NEVER throws (a Zoho hiccup
 * must never break the local create). Reuses the bulk push fns which only touch unsynced rows.
 */
export async function autoSyncAfterCreate(kind: string): Promise<void> {
  try {
    const cfg = await getZohoConfig();
    if (!cfg?.connected || !cfg.auto_sync) return;
    const token = await getAccessToken(cfg);
    if (kind === "contact") await syncContacts(cfg, token);
    else if (kind === "item") await syncItems(cfg, token);
    else if (isZohoDoc(kind)) { await syncContacts(cfg, token); await pushDocs(cfg, token, kind); } // any doc type: party first, then the doc
    else return;
    await run("UPDATE books_integration SET last_sync = ? WHERE id = 1", new Date().toISOString());
  } catch (e) {
    await run("UPDATE books_integration SET last_error = ? WHERE id = 1", `auto-sync: ${e instanceof Error ? e.message : "failed"}`).catch(() => {});
  }
}

/** Unsynced counts for the dashboard/status card. */
export async function pendingCounts(): Promise<{ contacts: number; items: number; documents: number }> {
  const c = await get<{ n: number }>("SELECT COUNT(*) n FROM books_parties WHERE zoho_id IS NULL");
  const i = await get<{ n: number }>("SELECT COUNT(*) n FROM books_items WHERE zoho_id IS NULL AND active = 1");
  const v = await get<{ n: number }>("SELECT COUNT(*) n FROM books_txns WHERE zoho_id IS NULL");
  return { contacts: c?.n ?? 0, items: i?.n ?? 0, documents: v?.n ?? 0 };
}

/* ===================== PULL: Zoho → NexusHR ===================== */

const str = (v: unknown) => (v == null ? "" : String(v));
const n2 = (v: unknown) => { const x = Number(v); return isFinite(x) ? x : 0; };
const mapInvStatus = (s: unknown): string => {
  const m: Record<string, string> = { paid: "Paid", partially_paid: "Partially Paid", overdue: "Overdue", sent: "Sent", draft: "Draft", void: "Void", unpaid: "Sent", viewed: "Sent" };
  return m[String(s)] || "Sent";
};

/** Import/update customers & vendors from Zoho. Match by zoho_id, then by email; else insert. */
export async function pullContacts(cfg: ZohoConfig, token: string): Promise<SyncResult> {
  const r: SyncResult = { entity: "Contacts", pushed: 0, skipped: 0, errors: [] };
  let page = 1, more = true, guard = 0;
  while (more && guard++ < 15) {
    const j = await zfetch(cfg, token, "GET", `contacts?per_page=200&page=${page}`);
    const list = (j.contacts as Record<string, unknown>[] | undefined) || [];
    for (const c of list) {
      try {
        const zid = str(c.contact_id);
        if (!zid) { r.skipped++; continue; }
        const type = c.contact_type === "vendor" ? "vendor" : "customer";
        const company = str(c.company_name);
        const name = str(c.contact_name) || company || "(unnamed)";
        const email = str(c.email), phone = str(c.phone) || str(c.mobile), gstin = str(c.gst_no);
        const ex = await get<{ id: number }>("SELECT id FROM books_parties WHERE zoho_id = ?", zid);
        if (ex) {
          await run("UPDATE books_parties SET name=?, company=?, email=?, phone=?, gstin=? WHERE id=?", name, company || null, email || null, phone || null, gstin || null, ex.id);
        } else {
          const match = email ? await get<{ id: number }>("SELECT id FROM books_parties WHERE zoho_id IS NULL AND type=? AND email=?", type, email) : undefined;
          if (match) await run("UPDATE books_parties SET zoho_id=?, name=?, company=?, phone=?, gstin=? WHERE id=?", zid, name, company || null, phone || null, gstin || null, match.id);
          else await run("INSERT INTO books_parties (type,name,company,email,phone,gstin,zoho_id) VALUES (?,?,?,?,?,?,?)", type, name, company || null, email || null, phone || null, gstin || null, zid);
        }
        r.pushed++;
      } catch (e) { r.errors.push(`${str(c.contact_name) || str(c.contact_id)}: ${e instanceof Error ? e.message : "failed"}`); }
    }
    more = !!(j.page_context as { has_more_page?: boolean } | undefined)?.has_more_page;
    page++;
  }
  return r;
}

/** Import/update items from Zoho. Match by zoho_id, then by name; else insert. */
export async function pullItems(cfg: ZohoConfig, token: string): Promise<SyncResult> {
  const r: SyncResult = { entity: "Items", pushed: 0, skipped: 0, errors: [] };
  let page = 1, more = true, guard = 0;
  while (more && guard++ < 15) {
    const j = await zfetch(cfg, token, "GET", `items?per_page=200&page=${page}`);
    const list = (j.items as Record<string, unknown>[] | undefined) || [];
    for (const it of list) {
      try {
        const zid = str(it.item_id);
        if (!zid) { r.skipped++; continue; }
        const name = str(it.name) || "(unnamed)", rate = n2(it.rate), type = it.product_type === "goods" ? "goods" : "service", sku = str(it.sku);
        const ex = await get<{ id: number }>("SELECT id FROM books_items WHERE zoho_id = ?", zid);
        if (ex) {
          await run("UPDATE books_items SET name=?, rate=?, type=? WHERE id=?", name, rate, type, ex.id);
        } else {
          const match = await get<{ id: number }>("SELECT id FROM books_items WHERE zoho_id IS NULL AND name=?", name);
          if (match) await run("UPDATE books_items SET zoho_id=?, rate=?, type=? WHERE id=?", zid, rate, type, match.id);
          else await run("INSERT INTO books_items (name,sku,type,rate,purchase_rate,tax_rate,stock,low_stock,unit,zoho_id) VALUES (?,?,?,?,0,?,0,0,'pcs',?)", name, sku || null, type, rate, n2(it.tax_percentage), zid);
        }
        r.pushed++;
      } catch (e) { r.errors.push(`${str(it.name) || str(it.item_id)}: ${e instanceof Error ? e.message : "failed"}`); }
    }
    more = !!(j.page_context as { has_more_page?: boolean } | undefined)?.has_more_page;
    page++;
  }
  return r;
}

/** Import invoices created in Zoho into NexusHR (match by zoho_id; NO stock side-effects). Caps detail fetches/run. */
export async function pullInvoices(cfg: ZohoConfig, token: string): Promise<SyncResult> {
  const r: SyncResult = { entity: "Invoices", pushed: 0, skipped: 0, errors: [] };
  const CAP = 50; let fetched = 0, page = 1, more = true, guard = 0;
  while (more && guard++ < 15) {
    const j = await zfetch(cfg, token, "GET", `invoices?per_page=200&page=${page}`);
    const list = (j.invoices as Record<string, unknown>[] | undefined) || [];
    for (const inv of list) {
      try {
        const zid = str(inv.invoice_id);
        if (!zid) { r.skipped++; continue; }
        const ex = await get<{ id: number }>("SELECT id FROM books_txns WHERE zoho_id = ?", zid);
        if (ex) {
          const total = n2(inv.total);
          await run("UPDATE books_txns SET status=?, total=?, paid=? WHERE id=?", mapInvStatus(inv.status), total, Math.max(0, total - n2(inv.balance)), ex.id);
          r.pushed++; continue;
        }
        const party = await get<{ id: number }>("SELECT id FROM books_parties WHERE zoho_id = ?", str(inv.customer_id));
        if (!party) { r.skipped++; continue; }        // customer not in NexusHR yet
        if (fetched >= CAP) { r.skipped++; continue; } // protect API quota; next pull gets the rest
        fetched++;
        const dj = await zfetch(cfg, token, "GET", `invoices/${zid}`);
        const full = (dj.invoice as Record<string, unknown>) || {};
        const lines = (full.line_items as Record<string, unknown>[] | undefined) || [];
        const subtotal = n2(full.sub_total), tax = n2(full.tax_total), total = n2(full.total), paid = Math.max(0, total - n2(full.balance));
        const info = await run(
          "INSERT INTO books_txns (type,number,party_id,txn_date,due_date,status,subtotal,tax,total,paid,zoho_id,created_by) VALUES ('invoice',?,?,?,?,?,?,?,?,?,?,1)",
          str(full.invoice_number) || `ZB-${zid}`, party.id, str(full.date) || null, str(full.due_date) || null, mapInvStatus(full.status), subtotal, tax, total, paid, zid);
        for (const l of lines) {
          const qty = n2(l.quantity) || 1, rate = n2(l.rate);
          await run("INSERT INTO books_txn_lines (txn_id,item_id,name,qty,rate,tax_rate,amount) VALUES (?,?,?,?,?,?,?)",
            info.lastInsertRowid, null, str(l.name) || str(l.description) || "Item", qty, rate, n2(l.tax_percentage), n2(l.item_total) || rate * qty);
        }
        r.pushed++;
      } catch (e) { r.errors.push(`${str(inv.invoice_number) || str(inv.invoice_id)}: ${e instanceof Error ? e.message : "failed"}`); }
    }
    more = !!(j.page_context as { has_more_page?: boolean } | undefined)?.has_more_page;
    page++;
  }
  return r;
}

export async function pullAll(cfg: ZohoConfig, token: string): Promise<SyncResult[]> {
  return [await pullContacts(cfg, token), await pullItems(cfg, token), await pullInvoices(cfg, token)];
}

/** Throttled background pull on CRM activity — runs only if connected, auto-sync on, and last pull is stale. */
export async function autoPullIfStale(maxAgeMs = 5 * 60 * 1000): Promise<boolean> {
  const cfg = await getZohoConfig();
  if (!cfg?.connected || !cfg.auto_sync) return false;
  if (cfg.last_pull) { const age = Date.now() - new Date(cfg.last_pull).getTime(); if (isFinite(age) && age < maxAgeMs) return false; }
  await run("UPDATE books_integration SET last_pull = ? WHERE id = 1", new Date().toISOString()); // claim first → no concurrent double-pull
  try { await pullAll(cfg, await getAccessToken(cfg)); return true; }
  catch (e) { await run("UPDATE books_integration SET last_error = ? WHERE id = 1", `auto-pull: ${e instanceof Error ? e.message : "failed"}`).catch(() => {}); return false; }
}

/* ================= EDIT-SYNC: NexusHR update → Zoho ================= */

/** Push an edited customer/vendor to Zoho (only if already synced). Best-effort, never throws. */
export async function pushUpdateContact(localId: number): Promise<void> {
  try {
    const cfg = await getZohoConfig();
    if (!cfg?.connected || !cfg.auto_sync) return;
    const p = await get<{ zoho_id: string | null; name: string; company: string | null; type: string; email: string | null; phone: string | null; billing_address: string | null }>(
      "SELECT zoho_id, name, company, type, email, phone, billing_address FROM books_parties WHERE id = ?", localId);
    if (!p?.zoho_id) return;
    const token = await getAccessToken(cfg);
    const body: Record<string, unknown> = { contact_name: p.name, contact_type: p.type === "vendor" ? "vendor" : "customer" };
    if (p.company) body.company_name = p.company;
    if (p.billing_address) body.billing_address = { address: p.billing_address };
    if (p.email || p.phone) body.contact_persons = [{ email: p.email || undefined, phone: p.phone || undefined, is_primary_contact: true }];
    await zfetch(cfg, token, "PUT", `contacts/${p.zoho_id}`, body);
  } catch (e) { await run("UPDATE books_integration SET last_error = ? WHERE id = 1", `update-sync: ${e instanceof Error ? e.message : "failed"}`).catch(() => {}); }
}

/** Push an edited item to Zoho (only if already synced). Best-effort, never throws. */
export async function pushUpdateItem(localId: number): Promise<void> {
  try {
    const cfg = await getZohoConfig();
    if (!cfg?.connected || !cfg.auto_sync) return;
    const it = await get<{ zoho_id: string | null; name: string; rate: number; type: string; sku: string | null }>(
      "SELECT zoho_id, name, rate, type, sku FROM books_items WHERE id = ?", localId);
    if (!it?.zoho_id) return;
    const token = await getAccessToken(cfg);
    const body: Record<string, unknown> = { name: it.name, rate: it.rate, product_type: it.type === "goods" ? "goods" : "service" };
    if (it.sku) body.sku = it.sku;
    await zfetch(cfg, token, "PUT", `items/${it.zoho_id}`, body);
  } catch (e) { await run("UPDATE books_integration SET last_error = ? WHERE id = 1", `update-sync: ${e instanceof Error ? e.message : "failed"}`).catch(() => {}); }
}
