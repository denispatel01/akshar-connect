import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, ArrowLeft, Trophy, Pencil, Trash2, Share2, Download, X, Check,
  Users, Target as TargetIcon, CheckCircle2, Percent, RefreshCw, UserPlus,
} from 'lucide-react';
import { leaderboardService, COMMON_UNITS } from '../services/leaderboardService';
import { isAdminRole } from '../utils/navItems';
import { alertError, confirmDialog } from '../utils/sweetAlert';

// ── helpers ──────────────────────────────────────────────────────────────────
const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; };
const fmt = (n) => (+(num(n).toFixed(2))).toLocaleString('en-IN');
const pct = (done, target) => (num(target) > 0 ? (num(done) / num(target)) * 100 : 0);
const fmtPct = (p) => p.toFixed(2) + '%';

function boardTotals(entries) {
  const target = entries.reduce((s, e) => s + num(e.target), 0);
  const done = entries.reduce((s, e) => s + num(e.done), 0);
  return { target, done, overall: pct(done, target), count: entries.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// Share image — draws the board onto a canvas matching the leaderboard design
// (green header, stat row, table, TOTAL footer). Returns a Blob (PNG).
// ═══════════════════════════════════════════════════════════════════════════
async function renderBoardImage(board, entries) {
  const S = 2; // supersample for crisp text
  const W = 660;
  const padX = 12;
  const headerH = board.subtitle ? 78 : 60;
  const statH = 76;
  const colH = 34;
  const rowBase = 44;
  const footerH = 42;

  // Pre-measure row heights (long names wrap to 2 lines).
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `700 16px Inter, system-ui, sans-serif`;
  const nameColW = 232;
  const rowLines = entries.map((e) => {
    const words = String(e.leaderName || '').split(' ');
    let line = '', lines = 1;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (measure.measureText(test).width > nameColW - 16 && line) { lines++; line = w; }
      else line = test;
    }
    return Math.min(lines, 2);
  });
  const rowHeights = rowLines.map((l) => (l > 1 ? rowBase + 18 : rowBase));
  const bodyH = rowHeights.reduce((s, h) => s + h, 0);
  const H = headerH + statH + colH + bodyH + footerH + 8;

  const canvas = document.createElement('canvas');
  canvas.width = W * S; canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);
  ctx.textBaseline = 'middle';

  const GREEN = '#1B5E20', GREEN2 = '#2E7D32', LIME = '#43A047';
  const BLUE = '#1976D2', PURPLE = '#7E57C2';

  // bg
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  // ── Header
  ctx.fillStyle = GREEN; ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `800 21px Inter, system-ui, sans-serif`;
  ctx.fillText('🌸 ' + (board.title || 'Leaderboard'), W / 2, board.subtitle ? 26 : headerH / 2);
  if (board.subtitle) {
    ctx.font = `600 13px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#C8E6C9';
    // wrap subtitle
    const words = board.subtitle.split(' ');
    let line = '', y = 52; const lines = [];
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (measure.measureText(test).width > W - 40 && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, W / 2, y + i * 16));
  }

  // thin lime bar
  ctx.fillStyle = LIME; ctx.fillRect(0, headerH, W, 8);

  // ── Stat row (4 cells)
  const sy = headerH + 8;
  const cells = [
    { big: String(entries.length), label: 'KARYAKARTAS', color: BLUE },
    { big: fmt(boardTotals(entries).target), label: 'TOTAL TARGET', color: PURPLE },
    { big: fmt(boardTotals(entries).done), label: 'DONE', color: GREEN2 },
    { big: fmtPct(boardTotals(entries).overall), label: 'OVERALL', color: LIME },
  ];
  const cw = W / 4;
  cells.forEach((c, i) => {
    const cx = cw * i + cw / 2;
    ctx.fillStyle = c.color;
    ctx.font = `800 26px Inter, system-ui, sans-serif`;
    ctx.fillText(c.big, cx, sy + 26);
    ctx.fillStyle = '#9E9E9E';
    ctx.font = `700 10px Inter, system-ui, sans-serif`;
    ctx.fillText(c.label, cx, sy + 54);
  });
  ctx.strokeStyle = '#E0E0E0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, sy + statH - 8); ctx.lineTo(W, sy + statH - 8); ctx.stroke();

  // ── Column header
  const cy = headerH + 8 + statH - 8;
  ctx.fillStyle = GREEN; ctx.fillRect(0, cy, W, colH);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 15px Inter, system-ui, sans-serif`;
  // columns: SN(46) | name(nameColW) | target | done | pct  -> remaining split
  const snW = 46;
  const restW = W - snW - nameColW; // for target/done/pct
  const tW = restW * 0.3, dW = restW * 0.26, pW = restW * 0.44;
  const xSN = snW / 2;
  const xName = snW + 12;
  const xT = snW + nameColW + tW / 2;
  const xD = snW + nameColW + tW + dW / 2;
  const xP = snW + nameColW + tW + dW + pW / 2;
  ctx.textAlign = 'center'; ctx.fillText('SN', xSN, cy + colH / 2);
  ctx.textAlign = 'left'; ctx.fillText('Katyakarta', xName, cy + colH / 2);
  ctx.textAlign = 'center';
  ctx.fillText(`Target (${board.unit || 'Kg'})`, xT, cy + colH / 2);
  ctx.fillText('Done', xD, cy + colH / 2);
  ctx.fillText('Percentage', xP, cy + colH / 2);

  // ── Body rows
  let ry = cy + colH;
  entries.forEach((e, i) => {
    const h = rowHeights[i];
    const p = pct(e.done, e.target);
    // zebra
    ctx.fillStyle = i % 2 ? '#F7F9F7' : '#FFFFFF';
    ctx.fillRect(0, ry, W, h);
    // percentage cell highlight when 0 (matches design's pale-yellow)
    ctx.fillStyle = p === 0 ? '#FFF8E1' : '#E8F5E9';
    ctx.fillRect(snW + nameColW + tW + dW, ry, pW, h);

    const midY = ry + h / 2;
    ctx.fillStyle = '#607D8B'; ctx.textAlign = 'center';
    ctx.font = `700 15px Inter, system-ui, sans-serif`;
    ctx.fillText(String(i + 1), xSN, midY);

    // name (wrap up to 2 lines)
    ctx.fillStyle = '#1B2A20'; ctx.textAlign = 'left';
    ctx.font = `700 16px Inter, system-ui, sans-serif`;
    const words = String(e.leaderName || '').split(' ');
    let line = '', lines = [];
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (measure.measureText(test).width > nameColW - 16 && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    lines = lines.slice(0, 2);
    const lh = 18;
    const startY = midY - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, li) => ctx.fillText(ln, xName, startY + li * lh));

    ctx.fillStyle = '#37474F'; ctx.textAlign = 'center';
    ctx.font = `700 16px Inter, system-ui, sans-serif`;
    ctx.fillText(num(e.target) ? fmt(e.target) : '', xT, midY);
    ctx.fillText(num(e.done) ? fmt(e.done) : '', xD, midY);
    ctx.fillStyle = p === 0 ? '#E65100' : '#1B5E20';
    ctx.font = `800 16px Inter, system-ui, sans-serif`;
    ctx.fillText(fmtPct(p), xP, midY);

    // bottom border
    ctx.strokeStyle = '#ECEFF1'; ctx.beginPath();
    ctx.moveTo(0, ry + h); ctx.lineTo(W, ry + h); ctx.stroke();
    ry += h;
  });

  // ── Footer TOTAL
  const t = boardTotals(entries);
  ctx.fillStyle = GREEN2; ctx.fillRect(0, ry, W, footerH);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 16px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('TOTAL', (snW + nameColW) / 2, ry + footerH / 2);
  ctx.fillText(fmt(t.target), xT, ry + footerH / 2);
  ctx.fillText(fmt(t.done), xD, ry + footerH / 2);
  ctx.fillText(fmtPct(t.overall), xP, ry + footerH / 2);

  return await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png', 0.95));
}

function downloadBlob_(blob, safe) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${safe}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// Native share sheet (phones). Returns false if sharing a file isn't supported
// here (e.g. most desktop browsers) so the caller can fall back to a download.
async function shareBoard(board, entries) {
  const blob = await renderBoardImage(board, entries);
  if (!blob) { alertError('Could not create image', 'Please try again.'); return false; }
  const safe = String(board.title || 'leaderboard').replace(/[^\w-]+/g, '_').slice(0, 40);
  const file = new File([blob], `${safe}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: board.title, text: board.title });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return true; // user cancelled — don't also download
      // otherwise fall through to download
    }
  }
  downloadBlob_(blob, safe);
  return true;
}

// Always downloads the PNG (used by the explicit Download button — handy on PC).
async function downloadBoard(board, entries) {
  const blob = await renderBoardImage(board, entries);
  if (!blob) { alertError('Could not create image', 'Please try again.'); return; }
  const safe = String(board.title || 'leaderboard').replace(/[^\w-]+/g, '_').slice(0, 40);
  downloadBlob_(blob, safe);
}

// ═══════════════════════════════════════════════════════════════════════════
// Create / edit board modal
// ═══════════════════════════════════════════════════════════════════════════
function BoardModal({ board, onClose, onSaved, user }) {
  const [title, setTitle] = useState(board?.title || '');
  const [subtitle, setSubtitle] = useState(board?.subtitle || '');
  const [unit, setUnit] = useState(board?.unit || 'Kg');
  const [busy, setBusy] = useState(false);
  const isEdit = !!board;

  const save = async () => {
    if (!title.trim()) { alertError('Title required', 'Give the leaderboard a name, e.g. "Chandi Padvo - Ghari Seva".'); return; }
    setBusy(true);
    try {
      if (isEdit) {
        await leaderboardService.updateBoard(board.id, { title: title.trim(), subtitle: subtitle.trim(), unit: unit.trim() || 'Kg' }, user?.name || '');
        onSaved?.(board.id);
      } else {
        const id = await leaderboardService.createBoard({ title, subtitle, unit, createdBy: user?.name || '' });
        onSaved?.(id);
      }
    } finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black text-text-main">{isEdit ? 'Edit leaderboard' : 'New leaderboard'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-text-muted hover:bg-bg-base"><X className="h-5 w-5" /></button>
        </div>
        <label className="mb-1 block text-xs font-bold text-text-muted">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chandi Padvo - Ghari Seva"
          className="mb-3 w-full rounded-xl border border-border-light bg-bg-base px-3 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
        <label className="mb-1 block text-xs font-bold text-text-muted">Subtitle <span className="font-normal">(optional)</span></label>
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="will be celebrated on 26-Oct-2026…"
          className="mb-3 w-full rounded-xl border border-border-light bg-bg-base px-3 py-2.5 text-sm font-semibold text-text-main outline-none focus:border-primary" />
        <label className="mb-1 block text-xs font-bold text-text-muted">Unit</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {COMMON_UNITS.map((u) => (
            <button key={u} onClick={() => setUnit(u)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${unit === u ? 'border-primary bg-primary/10 text-primary' : 'border-border-light bg-bg-base text-text-muted'}`}>{u}</button>
          ))}
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit"
            className="w-20 rounded-full border border-border-light bg-bg-base px-3 py-1.5 text-xs font-bold text-text-main outline-none focus:border-primary" />
        </div>
        {!isEdit && (
          <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            All mandal leaders will be added automatically. You just enter Target &amp; Done.
          </p>
        )}
        <button onClick={save} disabled={busy}
          className="w-full rounded-xl bg-primary py-3 text-sm font-black text-white disabled:opacity-60">
          {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create leaderboard'}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Board detail — data entry grid + share
// ═══════════════════════════════════════════════════════════════════════════
function BoardDetail({ boardId, onBack, onChanged, canEdit, user }) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [editBoard, setEditBoard] = useState(false);
  const [addingLeader, setAddingLeader] = useState(false);
  const [newLeader, setNewLeader] = useState('');
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const on = () => rerender();
    window.addEventListener('ac-leaderboard-changed', on);
    // Flush any pending debounced save when the board unmounts (user navigates away).
    return () => { window.removeEventListener('ac-leaderboard-changed', on); leaderboardService.flushSaves(); };
  }, []);

  const backWithFlush = () => { leaderboardService.flushSaves(); onBack?.(); };

  const board = leaderboardService.board(boardId);
  const entries = leaderboardService.entriesFor(boardId);
  const t = useMemo(() => boardTotals(entries), [entries]);

  if (!board) {
    return (
      <div className="p-6 text-center text-text-muted">
        <p className="font-bold">Board not found.</p>
        <button onClick={onBack} className="mt-3 text-primary font-bold">← Back</button>
      </div>
    );
  }

  const setVal = (entryId, field, value) => {
    leaderboardService.updateEntry(entryId, { [field]: num(value) });
  };

  const addLeader = async () => {
    if (!newLeader.trim()) return;
    await leaderboardService.addLeaderToBoard(boardId, newLeader.trim());
    setNewLeader(''); setAddingLeader(false);
  };

  const del = async () => {
    const ok = await confirmDialog({ title: 'Delete this leaderboard?', text: `"${board.title}" and all its entries will be removed.`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    await leaderboardService.deleteBoard(boardId);
    onChanged?.(); onBack();
  };

  const share = async () => {
    setSharing(true);
    try { await shareBoard(board, entries); } finally { setSharing(false); }
  };
  const download = async () => {
    setDownloading(true);
    try { await downloadBoard(board, entries); } finally { setDownloading(false); }
  };

  return (
    <div className="mx-auto max-w-3xl px-3 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button onClick={backWithFlush} className="flex items-center gap-1.5 text-sm font-bold text-text-muted"><ArrowLeft className="h-4 w-4" /> Back</button>
        <div className="flex items-center gap-2">
          <button onClick={share} disabled={sharing}
            className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-black text-white disabled:opacity-60">
            {sharing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Share
          </button>
          <button onClick={download} disabled={downloading}
            className="flex items-center gap-1.5 rounded-full border border-emerald-600 bg-surface px-3.5 py-2 text-xs font-black text-emerald-700 disabled:opacity-60">
            {downloading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download
          </button>
          {canEdit && (
            <>
              <button onClick={() => setEditBoard(true)} className="rounded-full border border-border-light p-2 text-text-muted hover:text-primary"><Pencil className="h-4 w-4" /></button>
              <button onClick={del} className="rounded-full border border-border-light p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </>
          )}
        </div>
      </div>

      {/* Header card */}
      <div className="overflow-hidden rounded-t-2xl bg-gradient-to-b from-green-800 to-green-700 px-4 py-4 text-center text-white">
        <h2 className="text-lg font-black">🌸 {board.title}</h2>
        {board.subtitle && <p className="mt-0.5 text-xs font-semibold text-green-100">{board.subtitle}</p>}
      </div>
      {/* Stat row */}
      <div className="grid grid-cols-4 border-x border-border-light bg-surface">
        {[
          { v: String(entries.length), l: 'Karyakartas', c: 'text-blue-600', Icon: Users },
          { v: fmt(t.target), l: 'Target', c: 'text-purple-600', Icon: TargetIcon },
          { v: fmt(t.done), l: 'Done', c: 'text-green-600', Icon: CheckCircle2 },
          { v: fmtPct(t.overall), l: 'Overall', c: 'text-green-600', Icon: Percent },
        ].map((s, i) => (
          <div key={i} className={`py-3 text-center ${i ? 'border-l border-border-light' : ''}`}>
            <div className={`text-lg font-black ${s.c}`}>{s.v}</div>
            <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-text-muted">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Data entry table */}
      <div className="overflow-hidden rounded-b-2xl border border-border-light">
        <div className="grid grid-cols-[32px_1fr_80px_80px_72px] gap-0 bg-green-800 px-2 py-2 text-[11px] font-black text-white">
          <div className="text-center">SN</div>
          <div>Katyakarta</div>
          <div className="text-center">Target</div>
          <div className="text-center">Done</div>
          <div className="text-center">%</div>
        </div>
        {entries.map((e, i) => {
          const p = pct(e.done, e.target);
          return (
            <div key={e.id} className={`grid grid-cols-[32px_1fr_80px_80px_72px] items-center gap-0 border-t border-border-light px-2 py-1.5 ${i % 2 ? 'bg-bg-base' : 'bg-surface'}`}>
              <div className="text-center text-xs font-bold text-text-muted">{i + 1}</div>
              <div className="pr-2 text-sm font-bold text-text-main leading-tight">{e.leaderName}</div>
              <NumCell value={e.target} onCommit={(v) => setVal(e.id, 'target', v)} disabled={!canEdit} />
              <NumCell value={e.done} onCommit={(v) => setVal(e.id, 'done', v)} disabled={!canEdit} />
              <div className={`text-center text-xs font-black ${p === 0 ? 'text-orange-500' : 'text-green-700'}`}>{fmtPct(p)}</div>
            </div>
          );
        })}
        {/* Total */}
        <div className="grid grid-cols-[32px_1fr_80px_80px_72px] items-center gap-0 border-t-2 border-green-700 bg-green-700 px-2 py-2 text-white">
          <div></div>
          <div className="text-sm font-black">TOTAL</div>
          <div className="text-center text-sm font-black">{fmt(t.target)}</div>
          <div className="text-center text-sm font-black">{fmt(t.done)}</div>
          <div className="text-center text-xs font-black">{fmtPct(t.overall)}</div>
        </div>
      </div>

      {canEdit && (
        <div className="mt-3">
          {addingLeader ? (
            <div className="flex items-center gap-2">
              <input value={newLeader} onChange={(e) => setNewLeader(e.target.value)} autoFocus placeholder="New leader name"
                onKeyDown={(e) => e.key === 'Enter' && addLeader()}
                className="flex-1 rounded-xl border border-border-light bg-bg-base px-3 py-2 text-sm font-semibold text-text-main outline-none focus:border-primary" />
              <button onClick={addLeader} className="rounded-xl bg-primary px-3 py-2 text-white"><Check className="h-4 w-4" /></button>
              <button onClick={() => { setAddingLeader(false); setNewLeader(''); }} className="rounded-xl border border-border-light px-3 py-2 text-text-muted"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <button onClick={() => setAddingLeader(true)} className="flex items-center gap-1.5 text-sm font-bold text-primary">
              <UserPlus className="h-4 w-4" /> Add leader
            </button>
          )}
        </div>
      )}

      {editBoard && <BoardModal board={board} user={user} onClose={() => setEditBoard(false)} onSaved={() => { setEditBoard(false); onChanged?.(); }} />}
    </div>
  );
}

// Small inline numeric cell, commits on blur / Enter.
function NumCell({ value, onCommit, disabled }) {
  const [v, setV] = useState(value === 0 || value ? String(value) : '');
  useEffect(() => { setV(value === 0 || value ? String(value) : ''); }, [value]);
  if (disabled) {
    return <div className="text-center text-sm font-bold text-text-main">{num(value) ? fmt(value) : ''}</div>;
  }
  return (
    <input
      inputMode="decimal" value={v}
      onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      placeholder="0"
      className="mx-auto w-[64px] rounded-lg border border-border-light bg-bg-base px-1 py-1.5 text-center text-sm font-bold text-text-main outline-none focus:border-primary"
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main page — board list
// ═══════════════════════════════════════════════════════════════════════════
export default function LeaderboardPage({ user }) {
  const canEdit = isAdminRole(user);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    leaderboardService.refresh();
    const on = () => rerender();
    window.addEventListener('ac-leaderboard-changed', on);
    window.addEventListener('ac-data-refreshed', () => leaderboardService.refresh());
    return () => window.removeEventListener('ac-leaderboard-changed', on);
  }, []);

  const { boards } = leaderboardService.getState();

  if (openId) {
    return <BoardDetail boardId={openId} user={user} canEdit={canEdit}
      onBack={() => setOpenId(null)} onChanged={() => rerender()} />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-black text-text-main">Leaderboard</h1>
        </div>
        {canEdit && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-black text-white">
            <Plus className="h-4 w-4" /> New
          </button>
        )}
      </div>
      <p className="mb-5 text-xs font-semibold text-text-muted">Adajan Mandal · progress board for every seva</p>

      {boards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-light py-14 text-center">
          <Trophy className="mx-auto h-10 w-10 text-text-muted/40" />
          <p className="mt-3 font-bold text-text-main">No leaderboards yet</p>
          <p className="mt-1 text-xs text-text-muted">{canEdit ? 'Tap “New” to create one — the 17 leaders are added for you.' : 'Nothing to show yet.'}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {boards.map((b) => {
            const t = boardTotals(leaderboardService.entriesFor(b.id));
            return (
              <button key={b.id} onClick={() => setOpenId(b.id)}
                className="group overflow-hidden rounded-2xl border border-border-light bg-surface text-left transition-shadow hover:shadow-md">
                <div className="bg-gradient-to-b from-green-800 to-green-700 px-4 py-3 text-white">
                  <div className="text-sm font-black leading-snug">🌸 {b.title}</div>
                  {b.subtitle && <div className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-green-100">{b.subtitle}</div>}
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-text-muted">Done / Target</div>
                    <div className="text-sm font-black text-text-main">{fmt(t.done)} / {fmt(t.target)} <span className="text-xs font-bold text-text-muted">{b.unit || 'Kg'}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase text-text-muted">Overall</div>
                    <div className={`text-lg font-black ${t.overall === 0 ? 'text-orange-500' : 'text-green-600'}`}>{fmtPct(t.overall)}</div>
                  </div>
                </div>
                {/* progress bar */}
                <div className="h-1.5 w-full bg-bg-base">
                  <div className="h-full bg-green-500" style={{ width: `${Math.min(100, t.overall)}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {creating && <BoardModal user={user} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); setOpenId(id); }} />}
    </div>
  );
}
