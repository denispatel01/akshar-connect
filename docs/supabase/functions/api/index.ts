// ============================================================================
// Akshar Connect — Supabase Edge Function API gateway (Deno / TypeScript)
// ============================================================================
// A faithful port of the handle_() action router in google-apps-script/Code.gs,
// against Postgres (this project's tables, see docs/supabase/schema.sql) instead
// of the Google Sheet. It keeps the EXACT request/response contract the frontend
// already uses — POST { action, ...payload } → JSON — so the only frontend change
// is API_URL in src/services/dataService.js (plus the anon key header). The Ghari
// offline outbox, hydrateSync/bootstrap, and the cache-first design all keep
// working unchanged.
//
// KEY TRANSLATION: schema.sql stores JSON blobs as jsonb and renames the Ghari
// order blobs (itemsJson→items, subOrdersJson→subOrders). The client, however,
// still sends/expects the Sheet shape (itemsJson as a STRING, etc.). So on the
// way OUT we serialize jsonb → string under the client's field name, and on the
// way IN we parse string → jsonb. System columns (deleted, created_at,
// updated_at) are stripped from responses.
//
// AUTH: writes run with the service-role key (RLS bypassed), and the same
// authorization the Sheet backend enforced is replicated here: Ghari ledger
// writes need Admin or the `ghari` module; delivery/payment marks need any known
// user; user management needs Admin; Bus writes need Admin/Sevak/`bus`.
//
// PHASE 1 STUBS (need external services, wired in a later phase — they return a
// clear ok:false so the client falls back, never a silent wrong success):
//   • email send (sendEmail)              → needs an email provider (Resend/SMTP)
//   • push (sendPush, createAnnouncement push, reminders) → needs FCM
//   • uploads (uploadPhoto/Challan/FeedMedia) → needs Supabase Storage; the
//     client already falls back to the local data URI when url is absent.
//   • getGroupAttendance                  → reads an external Google Sheet
//   • backupNow / Sheet-only repair utils  → not applicable to Postgres
//
// Deploy: `supabase functions deploy api --no-verify-jwt`
// (the gateway does its own actor checks; see docs/supabase/functions/README.md)
// ============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── sheet tab name → Postgres table name (mirrors migrate.mjs) ───────────────
const TAB2TABLE: Record<string, string> = {
  Users: "users", Devotees: "devotees", Sabhas: "sabhas", Attendance: "attendance",
  Followups: "followups", Thoughts: "thoughts", Areas: "areas", Activity: "activity",
  Changes: "changes", ErrorLog: "errorlog", PushLog: "pushlog", PushRecipients: "pushrecipients",
  PushTokens: "push_tokens", Announcements: "announcements", NotifReads: "notif_reads",
  PushStatus: "push_status", GhariProducts: "ghari_products", GhariOrders: "ghari_orders",
  GhariPurchases: "ghari_purchases", GhariStock: "ghari_stock", GhariLog: "ghari_log",
  MandalLeaders: "mandal_leaders", LeaderBoards: "leader_boards", LeaderEntries: "leader_entries",
  Swadhyay: "swadhyay", Seva: "seva", CalPlan: "cal_plan", FeedPosts: "feed_posts",
  FeedLikes: "feed_likes", FeedComments: "feed_comments", EmailCampaigns: "email_campaigns",
  EmailTemplates: "email_templates", BusEvents: "bus_events", BusBookings: "bus_bookings",
  Vato: "vato", DevoteeLog: "devotee_log",
};

// jsonb columns per table, as they are NAMED IN POSTGRES.
const JSONB_DB_COLS: Record<string, string[]> = {
  ghari_orders: ["items", "subOrders"],
  ghari_purchases: ["itemsJson"],
  ghari_stock: ["itemsJson"],
  seva: ["companionsJson"],
  feed_posts: ["mediaJson"],
  bus_bookings: ["passengersJson"],
  ghari_log: ["changesJson", "beforeJson", "afterJson"],
  devotee_log: ["changesJson", "beforeJson", "afterJson"],
};
// Rename map between the client's Sheet field name and the Postgres column.
// (Only ghari_orders renames; everything else keeps the same name.)
const RENAME_DB2CLIENT: Record<string, Record<string, string>> = {
  ghari_orders: { items: "itemsJson", subOrders: "subOrdersJson" },
};
const RENAME_CLIENT2DB: Record<string, Record<string, string>> = {
  ghari_orders: { itemsJson: "items", subOrdersJson: "subOrders" },
};
const SYSTEM_COLS = new Set(["deleted", "created_at", "updated_at"]);
const DELETED_STATUSES = new Set(["void", "removed"]);

// ── JSON helpers ─────────────────────────────────────────────────────────────
function jstr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return ""; }
}
function jparse(v: unknown, fallback: unknown): unknown {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

// DB row → client shape: stringify jsonb under the client's field name, strip
// system columns.
function toClient(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const jsonCols = JSONB_DB_COLS[table] || [];
  const rename = RENAME_DB2CLIENT[table] || {};
  for (const [k, v] of Object.entries(row)) {
    if (SYSTEM_COLS.has(k)) continue;
    const clientKey = rename[k] || k;
    out[clientKey] = jsonCols.includes(k) ? jstr(v) : v;
  }
  return out;
}

// Client row → DB shape: parse JSON strings into jsonb under the DB column name,
// derive the soft-delete flag from a void/removed status, drop unknown fields.
function toDb(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const jsonDbCols = new Set(JSONB_DB_COLS[table] || []);
  const c2d = RENAME_CLIENT2DB[table] || {};
  for (const [k, v] of Object.entries(row)) {
    if (SYSTEM_COLS.has(k)) continue;
    const dbKey = c2d[k] || k;
    if (jsonDbCols.has(dbKey)) {
      out[dbKey] = jparse(v, Array.isArray(v) ? v : (dbKey.endsWith("Json") && /change|before|after/i.test(dbKey) ? null : []));
    } else {
      out[dbKey] = v;
    }
  }
  if (typeof out.status === "string") out.deleted = DELETED_STATUSES.has(String(out.status).toLowerCase());
  return out;
}

// ── read helpers ──────────────────────────────────────────────────────────────
async function readAll(table: string, { includeDeleted = false } = {}): Promise<Record<string, unknown>[]> {
  let q = sb.from(table).select("*");
  if (!includeDeleted) q = q.eq("deleted", false);
  const { data, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data || []).map((r) => toClient(table, r as Record<string, unknown>));
}
const norm = (m: unknown) => String(m ?? "").replace(/\D/g, "").slice(-10);

// ── authorization (ports isAdminActor_ / ghariCanWrite_ / busCanWrite_ / …) ──
async function userByMobile(mobile: unknown): Promise<Record<string, unknown> | null> {
  const m = norm(mobile);
  if (!m) return null;
  const { data } = await sb.from("users").select("mobile,role,modules").eq("deleted", false);
  for (const u of data || []) if (norm((u as any).mobile) === m) return u as Record<string, unknown>;
  return null;
}
async function isAdminActor(p: any): Promise<boolean> {
  const u = await userByMobile(p?.actorMobile);
  return !!u && String(u.role || "").trim().toLowerCase() === "admin";
}
async function ghariCanWrite(p: any): Promise<boolean> {
  const u = await userByMobile(p?.actorMobile);
  if (!u) return false;
  if (String(u.role || "").trim().toLowerCase() === "admin") return true;
  return String(u.modules || "").toLowerCase().split(/[,|]/).some((x) => x.trim() === "ghari");
}
async function ghariKnownUser(p: any): Promise<boolean> {
  return !!(await userByMobile(p?.actorMobile));
}
async function busCanWrite(p: any): Promise<boolean> {
  const u = await userByMobile(p?.actorMobile);
  if (!u) return false;
  const role = String(u.role || "").trim().toLowerCase();
  if (role === "admin" || role === "sevak") return true;
  return String(u.modules || "").toLowerCase().split(/[,|]/).some((x) => x.trim() === "bus");
}

// ── generic upsert / soft-delete ──────────────────────────────────────────────
async function upsertRow(table: string, clientRow: Record<string, unknown>, pk: string) {
  const row = toDb(table, clientRow);
  const { error } = await sb.from(table).upsert(row, { onConflict: pk });
  if (error) throw new Error(`${table} upsert: ${error.message}`);
}
async function softDelete(table: string, pk: string, key: unknown) {
  const { error } = await sb.from(table).update({ deleted: true }).eq(pk, key);
  if (error) throw new Error(`${table} delete: ${error.message}`);
}
async function findOne(table: string, col: string, val: unknown): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb.from(table).select("*").eq(col, val).limit(1);
  if (error) throw new Error(`${table} find: ${error.message}`);
  return data && data.length ? (data[0] as Record<string, unknown>) : null;
}

// ── money math (identical to ghariService.js computeTotals) ──────────────────
function computeTotals(items: any[]): { total: number; boxes: number; byCategory: Record<string, number> } {
  const by: Record<string, number> = { ghee: 0, noghee: 0, sf: 0, bhusu: 0 };
  let total = 0, boxes = 0;
  (items || []).forEach((it) => {
    const line = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
    total += line; boxes += Number(it.qty) || 0;
    if (by[it.category] === undefined) by[it.category] = 0;
    by[it.category] += line;
  });
  return { total, boxes, byCategory: by };
}

// ── Ghari audit log (ports ghariLog_) ─────────────────────────────────────────
const GHARI_HEADERS: Record<string, string[]> = {
  order: ["id","orderNo","season","customerName","customerMobile","devoteeId","karyakarta","karyakartaId","itemsJson","itemsSummary","subOrdersJson","total","withGheeAmt","withoutGheeAmt","sugarFreeAmt","bhusuAmt","delivered","deliveredBoxes","deliveryDate","paymentReceived","balance","paymentType","status","remarks","createdBy","createdOn","updatedBy","updatedOn"],
  purchase: ["id","season","date","supplier","itemsJson","itemsSummary","boxes","amount","challan","remarks","status","createdBy","createdOn","updatedBy","updatedOn"],
  stock: ["id","season","date","karyakarta","karyakartaId","itemsJson","itemsSummary","boxes","remarks","status","createdBy","createdOn","updatedBy","updatedOn"],
  product: ["sku","name","size","category","unitPrice","sortOrder","active"],
};
async function ghariLog(entity: string, action: string, actor: string, before: any, after: any) {
  try {
    const H = GHARI_HEADERS[entity] || [];
    const skip = new Set(["updatedOn", "createdOn", "updatedBy", "createdBy"]);
    const changes: any[] = [];
    if (before && after) {
      for (const f of H) {
        if (skip.has(f)) continue;
        const b = before[f], a = after[f];
        if (String(b ?? "") !== String(a ?? "")) changes.push({ field: f, before: b ?? "", after: a ?? "" });
      }
    }
    const rec = {
      id: "GLOG-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: new Date().toISOString(), entity,
      entityId: String(after?.id ?? before?.id ?? after?.sku ?? before?.sku ?? ""),
      action, actor: String(actor || ""),
      changesJson: changes, beforeJson: before ?? null, afterJson: after ?? null,
    };
    await sb.from("ghari_log").insert(rec);
  } catch { /* never block a write on logging */ }
}
async function devoteeLog(action: string, actor: string, before: any, after: any) {
  try {
    const rec = {
      id: "DLOG-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: new Date().toISOString(),
      devoteeId: String(after?.id ?? before?.id ?? ""),
      name: String(after?.name ?? before?.name ?? ""),
      action, actor: String(actor || ""),
      changesJson: null, beforeJson: before ?? null, afterJson: after ?? null,
    };
    await sb.from("devotee_log").insert(rec);
  } catch { /* ignore */ }
}

async function nextGhariOrderNo(season: unknown): Promise<string> {
  const { data } = await sb.from("ghari_orders").select("orderNo,season").eq("season", String(season ?? ""));
  let max = 0;
  for (const o of data || []) { const n = parseInt(String((o as any).orderNo), 10); if (n > max) max = n; }
  return String(max + 1);
}

const ok = (o: Record<string, unknown> = {}) => ({ ok: true, ...o });
const err = (message: string) => ({ ok: false, error: message });
const STUB = (what: string) => err(`${what} is not available in the Postgres gateway yet (phase-1 stub).`);

// ============================================================================
// ACTION ROUTER (ports handle_)
// ============================================================================
async function handle(p: any): Promise<Record<string, unknown>> {
  const action = p.action || "bootstrap";

  switch (action) {
    case "ping": return ok({ ts: Date.now() });

    // ── bootstrap / directory reads ─────────────────────────────────────────
    case "bootstrap": {
      const [users, devotees, sabhas, thoughts, followups, areas, ann] = await Promise.all([
        readAll("users"), readAll("devotees"), readAll("sabhas"), readAll("thoughts"),
        readAll("followups"), readAll("areas"), readAll("announcements"),
      ]);
      ann.sort((a, b) => String(b.createdOn).localeCompare(String(a.createdOn)));
      return ok({ users, devotees, sabhas, thoughts, followups, areas, announcements: ann.slice(0, 50) });
    }
    case "getUsers": return ok({ users: await readAll("users") });

    // ── generic CRUD (insert / update / remove) ─────────────────────────────
    case "insert": {
      const table = TAB2TABLE[p.collection]; if (!table) return err("unknown collection");
      await upsertRow(table, p.row, pkOf(p.collection, p.keyField));
      if (p.collection === "Devotees") await devoteeLog("create", p.row?.createdBy || p.actor || "", null, p.row);
      return ok({ row: p.row });
    }
    case "update": {
      const table = TAB2TABLE[p.collection]; if (!table) return err("unknown collection");
      const pk = pkOf(p.collection, p.keyField);
      const before = p.collection === "Devotees" ? await findOne(table, pk, p.key) : null;
      await upsertRow(table, p.row, pk);
      if (p.collection === "Devotees") await devoteeLog("update", p.row?.updatedBy || p.actor || "", before ? toClient(table, before) : null, p.row);
      return ok();
    }
    case "remove": {
      const table = TAB2TABLE[p.collection]; if (!table) return err("unknown collection");
      const pk = pkOf(p.collection, p.keyField);
      const before = p.collection === "Devotees" ? await findOne(table, pk, p.key) : null;
      await softDelete(table, pk, p.key);
      if (before) await devoteeLog("delete", p.actor || "", toClient(table, before), null);
      return ok();
    }
    // bootstrap self-heal helpers (used by the current client).
    case "seedDevotees": {
      const existing = await readAll("devotees");
      if (existing.length === 0 && Array.isArray(p.rows)) for (const r of p.rows) await upsertRow("devotees", r, "id");
      return ok({ count: (await readAll("devotees")).length });
    }
    case "replaceDevotees": {
      // Postgres-safe: upsert the provided rows (never clear-and-refill).
      if (Array.isArray(p.rows)) for (const r of p.rows) await upsertRow("devotees", r, "id");
      return ok({ count: (await readAll("devotees")).length });
    }

    // ── devotee audit / revert ──────────────────────────────────────────────
    case "getDevoteeLog": {
      let dl = await readAll("devotee_log", { includeDeleted: true });
      if (p.devoteeId) dl = dl.filter((r) => String(r.devoteeId) === String(p.devoteeId));
      dl.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      return ok({ logs: dl.slice(0, Number(p.limit) || 200) });
    }
    case "devoteeRevert": {
      const entry = await findOne("devotee_log", "id", p.logId);
      if (!entry) return err("log entry not found");
      const before = (entry as any).beforeJson;
      if (!before) return err("no previous values to revert to (this was the first version)");
      const cur = await findOne("devotees", "id", before.id);
      await upsertRow("devotees", before, "id");
      await devoteeLog("revert", p.actor || "", cur ? toClient("devotees", cur) : null, before);
      return ok({ restored: before });
    }

    // ── attendance / followups ──────────────────────────────────────────────
    case "markAttendance": {
      const { data } = await sb.from("attendance").select("*").eq("sabhaId", p.sabhaId).eq("devoteeId", p.devoteeId).limit(1);
      const now = new Date().toISOString();
      const existing = data && data.length ? (data[0] as any) : null;
      const row = { id: existing?.id || "ATT-" + Date.now(), sabhaId: p.sabhaId, devoteeId: p.devoteeId, present: p.present !== false, timestamp: now, markedBy: p.markedBy || "" };
      await upsertRow("attendance", row, "id");
      const { data: atts } = await sb.from("attendance").select("id").eq("sabhaId", p.sabhaId).eq("present", true).eq("deleted", false);
      const presentCount = (atts || []).length;
      await sb.from("sabhas").update({ presentCount }).eq("id", p.sabhaId);
      return ok({ presentCount });
    }
    case "saveFollowup": {
      const { data } = await sb.from("followups").select("*").eq("eventId", p.eventId).eq("devoteeId", p.devoteeId).limit(1);
      const now = new Date().toISOString();
      const existing = data && data.length ? (data[0] as any) : null;
      const row = {
        id: existing?.id || "FUP-" + Date.now(), eventId: p.eventId, devoteeId: p.devoteeId, assignedTo: p.assignedTo || "",
        call: p.call === true || p.call === "true", inPerson: p.inPerson === true || p.inPerson === "true", message: p.message === true || p.message === "true",
        outcome: p.outcome || "", remark: p.remark || "", contactedOn: now, contactedBy: p.contactedBy || "",
      };
      await upsertRow("followups", row, "id");
      return ok({ row });
    }

    // ── users (admin-gated) ─────────────────────────────────────────────────
    case "upsertUser": {
      if (!(await isAdminActor(p))) return err("Not allowed — only an Admin can add or change users.");
      const cur = (await findOne("users", "mobile", p.mobile)) as any;
      const row = {
        mobile: p.mobile,
        pin: p.pin !== undefined && p.pin !== "" ? p.pin : (cur?.pin ?? ""),
        password: p.password !== undefined && p.password !== "" ? p.password : (cur?.password ?? ""),
        role: p.role || cur?.role || "Devotee",
        name: p.name || cur?.name || "Satsangi Devotee",
        modules: p.modules !== undefined ? p.modules : (cur?.modules ?? ""),
      };
      await upsertRow("users", row, "mobile");
      return ok({ user: row });
    }
    case "deleteUser": {
      if (!(await isAdminActor(p))) return err("Not allowed — only an Admin can delete users.");
      await softDelete("users", "mobile", p.mobile);
      return ok();
    }

    // ── activity / usage ────────────────────────────────────────────────────
    case "logActivity": {
      try { await sb.from("activity").insert({ ...(p.row || {}), ts: p.row?.ts || new Date().toISOString() }); } catch { /* ignore */ }
      return ok();
    }
    case "activity": {
      let rows = await readAll("activity", { includeDeleted: true });
      if (p.actor) rows = rows.filter((r) => String(r.actor) === String(p.actor));
      rows.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      return ok({ activity: rows.slice(0, Number(p.limit) || 300) });
    }
    case "getUsageDump": {
      const rows = (await readAll("activity", { includeDeleted: true }));
      rows.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      const out = rows.slice(0, Math.min(Number(p.limit) || 6000, 8000));
      return ok({ rows: out, total: rows.length, truncated: rows.length > out.length });
    }
    case "getUsageStats": {
      const rows = await readAll("activity", { includeDeleted: true });
      const byAction: Record<string, number> = {}; const byUser: Record<string, any> = {};
      for (const r of rows) {
        const act = String(r.action || "other"); byAction[act] = (byAction[act] || 0) + 1;
        const mob = norm(r.actorMobile); const key = mob || "name:" + String(r.actor || "?");
        const u = byUser[key] || (byUser[key] = { name: String(r.actor || ""), mobile: mob, count: 0, firstTs: "", lastTs: "", actions: {} });
        u.count++; u.actions[act] = (u.actions[act] || 0) + 1;
        const ts = String(r.ts || ""); if (ts > u.lastTs) { u.lastTs = ts; if (r.actor) u.name = String(r.actor); }
        if (!u.firstTs || ts < u.firstTs) u.firstTs = ts;
      }
      const users = Object.values(byUser).sort((a: any, b: any) => b.count - a.count);
      return ok({ total: rows.length, members: users.length, byAction, users });
    }
    case "getUsageDetail": {
      const actions = new Set(String(p.actions || p.action || "").split(",").map((s: string) => s.trim()).filter(Boolean));
      const mob = norm(p.actorMobile); const limit = Math.min(Number(p.limit) || 500, 3000);
      let rows = await readAll("activity", { includeDeleted: true });
      rows.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      rows = rows.filter((r) => (actions.size === 0 || actions.has(String(r.action))) && (!mob || norm(r.actorMobile) === mob));
      return ok({ rows: rows.slice(0, limit) });
    }

    // ── Ghari Seva (money) ──────────────────────────────────────────────────
    case "ghariBootstrap": {
      const season = p.season ? String(p.season) : "";
      const [products, allOrders, allPurch, allStock] = await Promise.all([
        readAll("ghari_products"), readAll("ghari_orders", { includeDeleted: true }),
        readAll("ghari_purchases", { includeDeleted: true }), readAll("ghari_stock", { includeDeleted: true }),
      ]);
      const seasonSet = new Set<string>();
      for (const o of allOrders) if (o.season) seasonSet.add(String(o.season));
      for (const pu of allPurch) if (pu.season) seasonSet.add(String(pu.season));
      for (const st of allStock) if (st.season) seasonSet.add(String(st.season));
      const seasons = [...seasonSet].sort((a, b) => Number(b) - Number(a));
      const f = (arr: any[]) => season ? arr.filter((x) => String(x.season) === season) : arr;
      return ok({ products, orders: f(allOrders), purchases: f(allPurch), stocks: f(allStock), season, seasons });
    }
    case "ghariUpsertOrder": {
      if (!(await ghariCanWrite(p))) return err("Not allowed — Ghari Seva is view-only for your account.");
      const row = { ...(p.row || {}) };
      if (!row.id) return err("missing id");
      const before = await findOne("ghari_orders", "id", row.id);
      const isNew = !before;
      if (!(parseInt(row.orderNo, 10) > 0)) {
        const bPrev = before ? toClient("ghari_orders", before) : null;
        row.orderNo = bPrev && parseInt(String(bPrev.orderNo), 10) > 0 ? bPrev.orderNo : await nextGhariOrderNo(row.season);
      }
      await upsertRow("ghari_orders", row, "id");
      await ghariLog("order", isNew ? "create" : (String(row.status || "").toLowerCase() === "void" ? "void" : "update"), row.updatedBy || row.createdBy || "", before ? toClient("ghari_orders", before) : null, row);
      // Email on new/edit is a phase-1 stub (no provider wired) — write succeeds regardless.
      return ok();
    }
    case "ghariMarkDelivery": {
      if (!(await ghariKnownUser(p))) return err("Not allowed — sign in to mark delivery/payment.");
      const row = p.row || {};
      if (!row.id) return err("missing id");
      const beforeRaw = await findOne("ghari_orders", "id", row.id);
      if (!beforeRaw) return err("order not found");
      const before = toClient("ghari_orders", beforeRaw);
      const items = jparse(before.itemsJson, []) as any[];
      let totalBoxes = 0, total = 0;
      for (const it of items) { const q = Number(it.qty) || 0; totalBoxes += q; total += q * (Number(it.unitPrice) || 0); }
      const after: Record<string, unknown> = { ...before };
      if (row.deliveredBoxes !== undefined || row.delivered !== undefined) {
        const n = Math.max(0, Math.min(totalBoxes, Math.round(Number(row.deliveredBoxes) || 0)));
        after.delivered = totalBoxes > 0 ? n >= totalBoxes : (row.delivered === true || String(row.delivered) === "true");
        after.deliveredBoxes = n;
        if (row.deliveryDate !== undefined && row.deliveryDate !== null && String(row.deliveryDate) !== "") after.deliveryDate = row.deliveryDate;
      }
      if (row.paymentReceived !== undefined || row.paymentType !== undefined) {
        const paid = Math.max(0, Number(row.paymentReceived) || 0);
        after.paymentReceived = paid;
        if (row.paymentType !== undefined) after.paymentType = String(row.paymentType || "");
        after.balance = total - paid;
      }
      after.updatedBy = row.updatedBy || "";
      after.updatedOn = row.updatedOn || new Date().toISOString();
      await upsertRow("ghari_orders", after, "id");
      await ghariLog("order", "delivery", String(after.updatedBy || ""), before, after);
      return ok();
    }
    case "ghariUpsertProduct": return await ghariUpsertGeneric(p, "ghari_products", "product", "sku");
    case "ghariUpsertPurchase": return await ghariUpsertGeneric(p, "ghari_purchases", "purchase", "id");
    case "ghariUpsertStock": return await ghariUpsertGeneric(p, "ghari_stock", "stock", "id");
    case "ghariDeleteOrder": return await ghariDeleteGeneric(p, "ghari_orders", "order", "id", p.id);
    case "ghariDeleteProduct": return await ghariDeleteGeneric(p, "ghari_products", "product", "sku", p.sku);
    case "ghariDeletePurchase": return await ghariDeleteGeneric(p, "ghari_purchases", "purchase", "id", p.id);
    case "ghariDeleteStock": return await ghariDeleteGeneric(p, "ghari_stock", "stock", "id", p.id);
    case "ghariImportOrders": {
      if (!(await ghariCanWrite(p))) return err("Not allowed.");
      const rows = p.rows || [];
      for (const r of rows) await upsertRow("ghari_orders", r, "id");
      return ok({ count: rows.length });
    }
    case "getGhariLog": {
      let gl = await readAll("ghari_log", { includeDeleted: true });
      if (p.entityId) gl = gl.filter((r) => String(r.entityId) === String(p.entityId));
      if (p.entity) gl = gl.filter((r) => String(r.entity) === String(p.entity));
      if (p.actor) { const a = String(p.actor).trim().toLowerCase(); gl = gl.filter((r) => String(r.actor || "").trim().toLowerCase() === a); }
      gl.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      return ok({ logs: gl.slice(0, Number(p.limit) || 300) });
    }
    case "ghariRevert": {
      if (!(await ghariCanWrite(p))) return err("Not allowed.");
      const entry = await findOne("ghari_log", "id", p.logId);
      if (!entry) return err("log entry not found");
      const before = (entry as any).beforeJson;
      if (!before) return err("no previous state to revert to (this was a create)");
      const ent = String((entry as any).entity);
      const coll = ent === "purchase" ? "ghari_purchases" : ent === "product" ? "ghari_products" : ent === "stock" ? "ghari_stock" : "ghari_orders";
      const keyField = coll === "ghari_products" ? "sku" : "id";
      const cur = await findOne(coll, keyField, before[keyField]);
      await upsertRow(coll, before, keyField);
      await ghariLog(ent, "revert", p.actor || "", cur ? toClient(coll, cur) : null, before);
      return ok({ restored: before });
    }

    // ── Swadhyay ────────────────────────────────────────────────────────────
    case "saveSwadhyay": {
      if (!p.devoteeId || !p.date) return err("devoteeId and date required");
      const key = `${p.devoteeId}|${p.date}`; const now = new Date().toISOString();
      const cur = await findOne("swadhyay", "key", key);
      const row = {
        key, devoteeId: p.devoteeId, mobile: p.mobile || "", name: p.name || "", date: p.date,
        bhajanMin: Number(p.bhajanMin) || 0, bhajanTime: p.bhajanTime || "", listenMin: Number(p.listenMin) || 0, readMin: Number(p.readMin) || 0,
        createdOn: (cur as any)?.createdOn || now, updatedOn: now,
      };
      await upsertRow("swadhyay", row, "key");
      return ok({ row });
    }
    case "getSwadhyay": {
      let all = await readAll("swadhyay");
      if (String(p.all || "") !== "1") all = all.filter((r) => String(r.devoteeId) === String(p.devoteeId));
      all.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return ok({ entries: all.slice(0, Number(p.limit) || 120) });
    }

    // ── Seva ────────────────────────────────────────────────────────────────
    case "saveSeva": {
      const now = new Date().toISOString();
      const id = p.id || "SEVA-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const cur = await findOne("seva", "id", id);
      const row = {
        id, karyakartaId: p.karyakartaId || "", karyakartaName: p.karyakartaName || "", karyakartaMobile: p.karyakartaMobile || "",
        date: p.date || "", fromTime: p.fromTime || "", toTime: p.toTime || "", category: p.category || "", work: p.work || "",
        visitedId: p.visitedId || "", visitedName: p.visitedName || "", companionsJson: p.companionsJson || "[]",
        planned: p.planned === true || String(p.planned || "") === "1" || String(p.planned || "") === "true" ? "1" : "",
        createdBy: (cur as any)?.createdBy || p.createdBy || "", createdOn: (cur as any)?.createdOn || now, updatedBy: p.createdBy || "", updatedOn: now,
      };
      await upsertRow("seva", row, "id");
      return ok({ row });
    }
    case "getSeva": {
      let all = await readAll("seva");
      const kid = String(p.karyakartaId || ""), vid = String(p.visitedId || "");
      if (String(p.all || "") !== "1") {
        all = all.filter((r) => {
          const inComp = kid && String(r.companionsJson || "").includes(`"${kid}"`);
          return (kid && String(r.karyakartaId) === kid) || inComp || (vid && String(r.visitedId) === vid);
        });
      }
      all.sort((a, b) => String(`${b.date}${b.fromTime || ""}`).localeCompare(String(`${a.date}${a.fromTime || ""}`)));
      return ok({ entries: all.slice(0, Number(p.limit) || 300) });
    }
    case "deleteSeva": { await softDelete("seva", "id", p.id); return ok(); }

    // ── Calendar plans ──────────────────────────────────────────────────────
    case "savePlan": {
      const now = new Date().toISOString();
      const id = p.id || "PLAN-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const cur = await findOne("cal_plan", "id", id);
      const row = { id, devoteeId: p.devoteeId || "", date: p.date || "", type: p.type || "", note: p.note || "", status: String(p.status || "planned") === "done" ? "done" : "planned", createdOn: (cur as any)?.createdOn || now, updatedOn: now };
      await upsertRow("cal_plan", row, "id");
      return ok({ row });
    }
    case "getPlans": {
      const all = (await readAll("cal_plan")).filter((r) => String(r.devoteeId) === String(p.devoteeId));
      all.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return ok({ plans: all });
    }
    case "deletePlan": { await softDelete("cal_plan", "id", p.id); return ok(); }

    // ── Feed ────────────────────────────────────────────────────────────────
    case "createPost": {
      const now = new Date().toISOString();
      const id = p.id || "POST-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      let media = "[]"; try { media = JSON.stringify((JSON.parse(String(p.mediaJson || "[]")) as any[]).slice(0, 10)); } catch { media = "[]"; }
      const row = { id, authorId: p.authorId || "", authorName: String(p.authorName || "").slice(0, 120), authorMobile: p.authorMobile || "", caption: String(p.caption || "").slice(0, 200), description: String(p.description || "").slice(0, 4000), mediaJson: media, likeCount: 0, commentCount: 0, createdOn: now, status: "active" };
      await upsertRow("feed_posts", row, "id");
      return ok({ post: row });
    }
    case "getFeed": {
      let all = (await readAll("feed_posts")).filter((r) => String(r.status || "active") !== "removed");
      all.sort((a, b) => String(b.createdOn).localeCompare(String(a.createdOn)));
      if (p.before) all = all.filter((r) => String(r.createdOn) < String(p.before));
      const limit = Number(p.limit) || 15;
      const page = all.slice(0, limit); const hasMore = all.length > limit;
      const liked: string[] = []; const did = String(p.devoteeId || "");
      if (did && page.length) {
        const ids = new Set(page.map((r) => r.id));
        for (const l of await readAll("feed_likes")) if (String(l.devoteeId) === did && ids.has(l.postId)) liked.push(String(l.postId));
      }
      return ok({ posts: page, hasMore, liked });
    }
    case "editPost": {
      const cur = await findOne("feed_posts", "id", p.id); if (!cur) return err("not found");
      if (String(p.isAdmin || "") !== "1" && (cur as any).authorId && String(p.requesterId || "") !== String((cur as any).authorId)) return err("not allowed");
      await sb.from("feed_posts").update({ caption: String(p.caption || "").slice(0, 2000), description: String(p.description || "").slice(0, 5000) }).eq("id", p.id);
      return ok({ post: toClient("feed_posts", (await findOne("feed_posts", "id", p.id))!) });
    }
    case "deletePost": {
      const cur = await findOne("feed_posts", "id", p.id); if (!cur) return err("not found");
      if (String(p.isAdmin || "") !== "1" && (cur as any).authorId && String(p.requesterId || "") !== String((cur as any).authorId)) return err("not allowed");
      await sb.from("feed_posts").update({ status: "removed", deleted: true }).eq("id", p.id);
      return ok();
    }
    case "toggleLike": {
      const postId = String(p.postId || ""), did = String(p.devoteeId || "");
      if (!postId || !did) return err("postId and devoteeId required");
      const likeId = `${postId}|${did}`; const want = String(p.on || "") === "1";
      const existing = await findOne("feed_likes", "id", likeId);
      if (want && !existing) await upsertRow("feed_likes", { id: likeId, postId, devoteeId: did, name: p.name || "", createdOn: new Date().toISOString() }, "id");
      else if (!want && existing) await sb.from("feed_likes").delete().eq("id", likeId);
      const { count } = await sb.from("feed_likes").select("*", { count: "exact", head: true }).eq("postId", postId).eq("deleted", false);
      await sb.from("feed_posts").update({ likeCount: count ?? 0 }).eq("id", postId);
      return ok({ liked: want, likeCount: count ?? 0 });
    }
    case "getComments": {
      const all = (await readAll("feed_comments")).filter((r) => String(r.postId) === String(p.postId) && String(r.status || "active") !== "removed");
      all.sort((a, b) => String(a.createdOn).localeCompare(String(b.createdOn)));
      return ok({ comments: all });
    }
    case "addComment": {
      const postId = String(p.postId || ""); const text = String(p.text || "").slice(0, 1000).trim();
      if (!postId || !text) return err("postId and text required");
      const row = { id: "CMT-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), postId, authorId: p.authorId || "", authorName: String(p.authorName || "").slice(0, 120), text, createdOn: new Date().toISOString(), status: "active" };
      await upsertRow("feed_comments", row, "id");
      const { count } = await sb.from("feed_comments").select("*", { count: "exact", head: true }).eq("postId", postId).eq("status", "active");
      await sb.from("feed_posts").update({ commentCount: count ?? 0 }).eq("id", postId);
      return ok({ comment: row, commentCount: count ?? 0 });
    }
    case "deleteComment": {
      const cur = await findOne("feed_comments", "id", p.id); if (!cur) return err("not found");
      if (String(p.isAdmin || "") !== "1" && (cur as any).authorId && String(p.requesterId || "") !== String((cur as any).authorId)) return err("not allowed");
      const postId = String((cur as any).postId || "");
      await sb.from("feed_comments").update({ status: "removed", deleted: true }).eq("id", p.id);
      if (postId) { const { count } = await sb.from("feed_comments").select("*", { count: "exact", head: true }).eq("postId", postId).eq("status", "active"); await sb.from("feed_posts").update({ commentCount: count ?? 0 }).eq("id", postId); }
      return ok();
    }

    // ── Push / announcements (data only; FCM delivery is a stub) ─────────────
    case "registerPushToken": {
      if (!p.token) return err("no token");
      await upsertRow("push_tokens", { token: p.token, devoteeId: p.devoteeId || "", mobile: p.mobile || "", name: p.name || "", platform: p.platform || "", updatedOn: new Date().toISOString() }, "token");
      return ok();
    }
    case "logPushStatus": {
      const key = String(p.key || p.devoteeId || p.mobile || "").trim(); if (!key) return err("no key");
      await upsertRow("push_status", { key, devoteeId: p.devoteeId || "", mobile: p.mobile || "", name: p.name || "", status: p.status || "", platform: p.platform || "", updatedOn: new Date().toISOString() }, "key");
      return ok();
    }
    case "getPushStatus": return ok({ status: await readAll("push_status") });
    case "getPushLog": { const l = await readAll("pushlog"); l.sort((a, b) => String(b.createdOn).localeCompare(String(a.createdOn))); return ok({ log: l.slice(0, Math.min(Number(p.limit) || 50, 200)) }); }
    case "getPushRecipients": return ok({ recipients: (await readAll("pushrecipients")).filter((r) => String(r.notifId) === String(p.nid)) });
    case "getAnnouncements": { const l = await readAll("announcements"); l.sort((a, b) => String(b.createdOn).localeCompare(String(a.createdOn))); return ok({ announcements: l.slice(0, 50) }); }
    case "createAnnouncement": {
      const id = "ANN-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const row = { id, title: p.title || "", body: p.body || "", audience: ["all", "staff", "devotees"].includes(p.audience) ? p.audience : "all", createdBy: p.createdBy || "", createdOn: new Date().toISOString(), sentCount: 0 };
      await upsertRow("announcements", row, "id");
      // FCM push is a phase-1 stub; the announcement is saved and shown in-app.
      return ok({ announcement: row, sent: 0, pushStub: true });
    }
    case "logNotifRead": {
      const aid = String(p.announcementId || ""); if (!aid) return err("missing announcementId");
      const mob = norm(p.actorMobile);
      const existing = (await readAll("notif_reads")).some((r) => String(r.announcementId) === aid && norm(r.mobile) === mob);
      if (existing) return ok({ deduped: true });
      await upsertRow("notif_reads", { id: "NR-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), announcementId: aid, title: p.title || "", mobile: mob, name: p.name || p.by || "", readOn: new Date().toISOString() }, "id");
      return ok();
    }
    case "getNotifReads": { const nr = await readAll("notif_reads"); nr.sort((a, b) => String(b.readOn).localeCompare(String(a.readOn))); return ok({ reads: nr.slice(0, Math.min(Number(p.limit) || 100, 500)) }); }

    // ── Email (data reads work; sending is a stub) ───────────────────────────
    case "getEmailCampaigns": { const l = await readAll("email_campaigns"); l.sort((a, b) => String(b.createdOn).localeCompare(String(a.createdOn))); return ok({ campaigns: l.slice(0, 50) }); }
    case "getEmailTemplates": { const l = await readAll("email_templates"); l.sort((a, b) => String(a.name).localeCompare(String(b.name))); return ok({ templates: l }); }
    case "saveEmailTemplate": {
      const now = new Date().toISOString();
      const id = p.id || "TPL-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const name = String(p.name || "").slice(0, 80).trim(); if (!name) return err("Template name is required.");
      const cur = await findOne("email_templates", "id", id);
      const row = { id, name, subject: String(p.subject || "").slice(0, 200), body: String(p.body || "").slice(0, 4000), createdBy: (cur as any)?.createdBy || p.actor || "", createdOn: (cur as any)?.createdOn || now, updatedBy: p.actor || "", updatedOn: now };
      await upsertRow("email_templates", row, "id");
      return ok({ template: row });
    }
    case "deleteEmailTemplate": { await softDelete("email_templates", "id", p.id); return ok(); }
    case "getEmailQuota": return ok({ quotaLeft: 1000 }); // no Gmail quota in the new backend

    // ── Vato ────────────────────────────────────────────────────────────────
    case "getVato": { const v = await readAll("vato"); v.sort((a, b) => Number(a.SN) - Number(b.SN)); return ok({ vato: v }); }

    // ── Bus Seva ────────────────────────────────────────────────────────────
    case "busBootstrap": return ok({ events: await readAll("bus_events"), bookings: await readAll("bus_bookings") });
    case "busUpsertEvent": case "busUpsertBooking": case "busDeleteEvent": case "busDeleteBooking": {
      if (!(await busCanWrite(p))) return err("Not allowed — Bus Seva is view-only for your account.");
      if (action === "busUpsertEvent") { if (!p.row?.id) return err("missing id"); await upsertRow("bus_events", p.row, "id"); return ok(); }
      if (action === "busUpsertBooking") { if (!p.row?.id) return err("missing id"); await upsertRow("bus_bookings", p.row, "id"); return ok(); }
      if (action === "busDeleteEvent") { await softDelete("bus_events", "id", p.id); return ok(); }
      await softDelete("bus_bookings", "id", p.id); return ok();
    }

    // ── Leaderboards (generic port — boards + entries + leaders) ─────────────
    case "getLeaderboards": {
      const [boards, entries, leaders] = await Promise.all([readAll("leader_boards"), readAll("leader_entries"), readAll("mandal_leaders")]);
      return ok({ boards, entries, leaders });
    }
    case "seedMandalLeaders": return ok({ leaders: await readAll("mandal_leaders") });
    case "saveLeaderboard": {
      if (p.board?.id) await upsertRow("leader_boards", p.board, "id");
      if (Array.isArray(p.entries)) for (const e of p.entries) if (e?.id) await upsertRow("leader_entries", e, "id");
      return ok({ board: p.board, entries: p.entries || [] });
    }
    case "deleteLeaderboard": { if (p.id) await softDelete("leader_boards", "id", p.id); return ok(); }

    // ── Error log (powers `npm run errors`) ──────────────────────────────────
    case "logError": {
      const id = p.id || "ERR-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      await upsertRow("errorlog", { id, time: p.time || new Date().toISOString(), user: p.user || "", mobile: p.mobile || "", message: p.message || "", page: p.page || "", stack: p.stack || "", ua: p.ua || "", status: "open", resolvedBy: "", resolvedOn: "" }, "id");
      // Admin error email is a phase-1 stub (no provider wired); the row is stored.
      return ok({ id });
    }
    case "getErrorLog": {
      let el = await readAll("errorlog", { includeDeleted: true });
      if (String(p.all || "") !== "1") el = el.filter((r) => String(r.status || "open") !== "resolved");
      el.sort((a, b) => String(b.time).localeCompare(String(a.time)));
      return ok({ errors: el.slice(0, Number(p.limit) || 200) });
    }
    case "resolveError": {
      if (String(p.id || "") === "all") { await sb.from("errorlog").update({ status: "resolved", resolvedBy: p.by || "", resolvedOn: new Date().toISOString() }).eq("status", "open"); return ok(); }
      await sb.from("errorlog").update({ status: "resolved", resolvedBy: p.by || "", resolvedOn: new Date().toISOString() }).eq("id", p.id);
      return ok();
    }

    // ── mail on/off (echo; the new backend has no per-write email yet) ───────
    case "getMailEnabled": return ok({ enabled: true });
    case "setMailEnabled": return ok({ enabled: !!p.enabled });

    // ── PHASE-1 STUBS: external services not wired yet ───────────────────────
    case "sendEmail": return STUB("Email sending");
    case "sendPush": case "sendFollowupReminder": return STUB("Push notifications (FCM)");
    case "uploadPhoto": case "uploadChallan": case "uploadFeedMedia": return STUB("File uploads (Supabase Storage)");
    case "getGroupAttendance": return ok({ ok: true, sessions: [], byDevotee: [], devoteeCount: 0, sessionCount: 0, stub: true });
    case "backupNow": return STUB("Backups");
    case "pushClicked": return ok({ stub: true });
    case "getActivityWatch": return ok({ on: false, mobile: "" });
    case "setActivityWatch": return ok({ on: !!p.on, mobile: p.mobile || "" });

    // Sheet-only repair / inspection utilities — not applicable to Postgres.
    case "testMail": case "peekHeaders": case "peekTab": case "listTabs": case "ghariRawDump":
    case "repairFromBackup": case "classifyOldNew": case "markReference": case "syncFamilyFields":
    case "repairDupSabhaIds": case "realignGhariOrders": case "backfillGhariOrderNos":
    case "repairGhariShift": case "remapFamilyIds": case "reset": case "bulkUpdateTags":
    case "bulkSetTags": case "addLeaderLog": case "deleteLeaderLog":
      return err(`'${action}' is a Sheet-only operation and is not part of the Postgres gateway.`);

    default:
      return err(`Unknown action '${action}'.`);
  }
}

function pkOf(collection: string, keyField?: string): string {
  if (keyField) return keyField;
  const special: Record<string, string> = { Users: "mobile", Areas: "name", PushTokens: "token", PushStatus: "key", Swadhyay: "key", GhariProducts: "sku", Vato: "SN" };
  return special[collection] || "id";
}

async function ghariUpsertGeneric(p: any, table: string, entity: string, pk: string) {
  if (!(await ghariCanWrite(p))) return err("Not allowed — Ghari Seva is view-only for your account.");
  const row = p.row || {};
  if (!row[pk]) return err(`missing ${pk}`);
  const before = await findOne(table, pk, row[pk]);
  await upsertRow(table, row, pk);
  const act = !before ? "create" : (String(row.status || "").toLowerCase() === "void" ? "void" : "update");
  await ghariLog(entity, act, row.updatedBy || row.createdBy || "", before ? toClient(table, before) : null, row);
  return ok();
}
async function ghariDeleteGeneric(p: any, table: string, entity: string, pk: string, key: unknown) {
  if (!(await ghariCanWrite(p))) return err("Not allowed — Ghari Seva is view-only for your account.");
  if (key === undefined || key === null || key === "") return err(`missing ${pk}`);
  const before = await findOne(table, pk, key);
  await softDelete(table, pk, key);
  if (before) await ghariLog(entity, "delete", p.actor || "", toClient(table, before), null);
  return ok();
}

// ── HTTP entry point ──────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let p: any = {};
  try {
    const raw = await req.text();
    if (raw) p = JSON.parse(raw);
  } catch { /* fall through with {} → bootstrap */ }
  if (req.method === "GET") { const u = new URL(req.url); u.searchParams.forEach((v, k) => { if (!(k in p)) p[k] = v; }); }

  let body: Record<string, unknown>;
  try {
    body = await handle(p);
  } catch (e) {
    body = { ok: false, error: String((e as Error)?.message || e) };
  }
  return new Response(JSON.stringify(body), { headers: { ...CORS, "Content-Type": "application/json" } });
});
