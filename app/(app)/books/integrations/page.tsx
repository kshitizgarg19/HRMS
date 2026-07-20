"use client";

import { useState } from "react";
import { RefreshCw, Plug, PlugZap, CheckCircle2, AlertTriangle, Users2, Package, FileText, ExternalLink, ShieldCheck, Zap, ArrowUpFromLine, ArrowDownToLine } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { Badge, Button, Card, Field, Input, Select, PageHeader, PageLoader, StatCard, useToast, cn } from "@/components/ui";

type Status = {
  connected: boolean; dc: string; orgId: string | null; clientId: string | null;
  autoSync: boolean; lastSync: string | null; lastPull: string | null; lastError: string | null;
  pending: { contacts: number; items: number; documents: number };
};
type SyncRes = { entity: string; pushed: number; skipped: number; errors: string[] };

const DC_LABEL: Record<string, string> = { in: "India (.in)", com: "US (.com)", eu: "Europe (.eu)", "com.au": "Australia (.com.au)", jp: "Japan (.jp)", ca: "Canada (.ca)", sa: "Saudi (.sa)", "com.cn": "China (.com.cn)" };
const fmtWhen = (s: string | null) => { if (!s) return "never"; const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); };

export default function ZohoIntegrationPage() {
  const { data, reload } = useData<Status>("/api/books/integration");
  const [form, setForm] = useState({ dc: "in", client_id: "", client_secret: "", org_id: "", grant_token: "" });
  const [busy, setBusy] = useState("");
  const [results, setResults] = useState<SyncRes[] | null>(null);
  const toast = useToast();

  if (!data) return <PageLoader />;
  const pending = data.pending ?? { contacts: 0, items: 0, documents: 0 }; // defensive against a stale cached shape

  const connect = async () => {
    if (!form.client_id || !form.client_secret || !form.org_id || !form.grant_token) return toast.push("error", "Please fill in all fields");
    setBusy("connect");
    try { await api("/api/books/integration", { method: "POST", body: JSON.stringify({ action: "connect", ...form }) }); toast.push("success", "Zoho Books connected ✓"); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Connection failed"); }
    finally { setBusy(""); }
  };
  const disconnect = async () => {
    setBusy("disconnect");
    try { await api("/api/books/integration", { method: "POST", body: JSON.stringify({ action: "disconnect" }) }); toast.push("success", "Disconnected"); setResults(null); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(""); }
  };
  const sync = async (scope: string) => {
    setBusy(`sync-${scope}`);
    try {
      const r = await api<{ results: SyncRes[] }>("/api/books/integration", { method: "POST", body: JSON.stringify({ action: "sync", scope }) });
      setResults(r.results);
      const pushed = r.results.reduce((s, x) => s + x.pushed, 0);
      toast.push("success", `Synced ${pushed} record${pushed === 1 ? "" : "s"} to Zoho`);
      reload();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "Sync failed"); }
    finally { setBusy(""); }
  };
  const toggleAuto = async () => {
    setBusy("auto");
    try { await api("/api/books/integration", { method: "POST", body: JSON.stringify({ action: "toggle_auto" }) }); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(""); }
  };
  const pull = async () => {
    setBusy("pull");
    try {
      const r = await api<{ results: SyncRes[] }>("/api/books/integration", { method: "POST", body: JSON.stringify({ action: "pull" }) });
      setResults(r.results);
      const got = r.results.reduce((s, x) => s + x.pushed, 0);
      toast.push("success", `Pulled ${got} record${got === 1 ? "" : "s"} from Zoho`);
      reload();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "Pull failed"); }
    finally { setBusy(""); }
  };

  return (
    <div className="fade-up">
      <PageHeader title="Zoho Books Sync" subtitle="Connect your real Zoho Books organization and push contacts, items & invoices" icon={<RefreshCw size={20} />}
        actions={<Badge tone={data.connected ? "Paid" : "Draft"}>{data.connected ? "Connected" : "Not connected"}</Badge>} />

      {!data.connected ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* Connect form */}
          <Card title="Connect to Zoho Books" icon={<Plug size={16} />} className="lg:col-span-3">
            <div className="space-y-3">
              <Field label="Data Centre" hint="The domain your Zoho opens on (yours is books.zoho.in → India)">
                <Select value={form.dc} onChange={(e) => setForm({ ...form, dc: e.target.value })}>
                  {Object.entries(DC_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Client ID" required><Input value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} placeholder="1000.XXXXXXXXXXXXXXXX" /></Field>
              <Field label="Client Secret" required><Input type="password" value={form.client_secret} onChange={(e) => setForm({ ...form, client_secret: e.target.value })} placeholder="••••••••••••••••" /></Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Organization ID" required><Input value={form.org_id} onChange={(e) => setForm({ ...form, org_id: e.target.value })} placeholder="60074138008" /></Field>
                <Field label="Grant Token (code)" required hint="From the Self Client · expires in ~3 min"><Input value={form.grant_token} onChange={(e) => setForm({ ...form, grant_token: e.target.value })} placeholder="1000.abcd…" /></Field>
              </div>
              <Button onClick={connect} loading={busy === "connect"} className="w-full"><PlugZap size={15} /> Connect & Verify</Button>
              <p className="flex items-center gap-1.5 text-xs text-slate-400"><ShieldCheck size={13} /> Your secret &amp; token are stored HR/Admin-only and never sent to the browser.</p>
            </div>
          </Card>

          {/* Help */}
          <Card title="Where to get the keys" icon={<ExternalLink size={16} />} className="lg:col-span-2">
            <ol className="space-y-2.5 text-[13px] text-slate-600 dark:text-slate-300">
              <li><span className="font-bold text-slate-800 dark:text-slate-100">1.</span> Open <a href="https://api-console.zoho.in" target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline">api-console.zoho.in</a> → create a <b>Self Client</b> → copy the <b>Client ID</b> &amp; <b>Client Secret</b>.</li>
              <li><span className="font-bold text-slate-800 dark:text-slate-100">2.</span> In the Self Client → <b>Generate Code</b> tab → scope <code className="rounded bg-slate-100 px-1 text-[11px] dark:bg-slate-800">ZohoBooks.fullaccess.all</code>, duration 10 min → copy the <b>Grant Token</b> (code).</li>
              <li><span className="font-bold text-slate-800 dark:text-slate-100">3.</span> In Zoho Books → <b>Settings → Organization</b>, copy the <b>Organization ID</b>.</li>
              <li><span className="font-bold text-slate-800 dark:text-slate-100">4.</span> Paste them here and hit <b>Connect</b> — the grant token expires fast, so be quick.</li>
            </ol>
          </Card>
        </div>
      ) : (
        <>
          {/* Connected status */}
          <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard label="Organization" value={data.orgId || "—"} icon={<CheckCircle2 size={20} />} accent="emerald" sub={DC_LABEL[data.dc] || data.dc} />
            <StatCard label="Pending Contacts" value={pending.contacts} icon={<Users2 size={20} />} accent="sky" sub="not yet in Zoho" />
            <StatCard label="Pending Items" value={pending.items} icon={<Package size={20} />} accent="violet" sub="not yet in Zoho" />
            <StatCard label="Pending Documents" value={pending.documents} icon={<FileText size={20} />} accent="amber" sub="quotes, invoices, bills…" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Two-Way Sync" icon={<RefreshCw size={16} />} className="lg:col-span-2">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-600"><ArrowUpFromLine size={13} /> Push · NexusHR → Zoho</div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => sync("contacts")} loading={busy === "sync-contacts"}><Users2 size={14} /> Contacts</Button>
                <Button variant="outline" onClick={() => sync("items")} loading={busy === "sync-items"}><Package size={14} /> Items</Button>
                <Button variant="outline" onClick={() => sync("documents")} loading={busy === "sync-documents"}><FileText size={14} /> Documents</Button>
                <Button onClick={() => sync("all")} loading={busy === "sync-all"}><ArrowUpFromLine size={14} /> Push All</Button>
              </div>
              <div className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-indigo-600"><ArrowDownToLine size={13} /> Pull · Zoho → NexusHR</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={pull} loading={busy === "pull"}><ArrowDownToLine size={14} /> Pull from Zoho</Button>
                <span className="text-xs text-slate-400">Auto-pull is on — Zoho changes flow in automatically when you open the CRM.</span>
              </div>

              {results && (
                <div className="mt-4 space-y-2">
                  {results.map((r) => (
                    <div key={r.entity} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">{r.entity}</span>
                        <span className="flex items-center gap-2 text-xs">
                          <Badge tone="Paid">{r.pushed} pushed</Badge>
                          {r.skipped > 0 && <Badge tone="Pending">{r.skipped} skipped</Badge>}
                          {r.errors.length > 0 && <Badge tone="Rejected">{r.errors.length} failed</Badge>}
                        </span>
                      </div>
                      {r.errors.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-xs text-rose-600 dark:text-rose-400">
                          {r.errors.slice(0, 5).map((e, i) => <li key={i} className="flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {e}</li>)}
                          {r.errors.length > 5 && <li className="text-slate-400">+{r.errors.length - 5} more…</li>}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Settings" icon={<Plug size={16} />}>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-3 dark:border-slate-700">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[13px] font-bold text-slate-800 dark:text-slate-100"><Zap size={14} className="text-amber-500" /> Auto-sync</span>
                    <span className="block text-xs text-slate-400">New/edited docs auto-push · Zoho changes auto-pull</span>
                  </span>
                  <button onClick={toggleAuto} disabled={busy === "auto"} className={cn("relative h-6 w-11 shrink-0 rounded-full transition", data.autoSync ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-700")} aria-label="Toggle auto-sync">
                    <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", data.autoSync ? "left-[22px]" : "left-0.5")} />
                  </button>
                </div>
                <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-[13px] dark:bg-slate-800/50">
                  <div className="flex justify-between"><span className="text-slate-500">Last push</span><span className="font-semibold text-slate-700 dark:text-slate-200">{fmtWhen(data.lastSync)}</span></div>
                  <div className="mt-1 flex justify-between"><span className="text-slate-500">Last pull</span><span className="font-semibold text-slate-700 dark:text-slate-200">{fmtWhen(data.lastPull)}</span></div>
                  <div className="mt-1 flex justify-between"><span className="text-slate-500">Client ID</span><span className="font-mono text-xs text-slate-500">{data.clientId || "—"}</span></div>
                </div>
                {data.lastError && <p className="flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {data.lastError}</p>}
                <Button variant="outline" onClick={disconnect} loading={busy === "disconnect"} className="w-full !text-rose-600">Disconnect</Button>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
