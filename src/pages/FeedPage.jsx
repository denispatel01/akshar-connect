import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon, Video, X, Send, Heart, MessageCircle, Trash2,
  Loader2, Sparkles, ChevronLeft, ChevronRight, Camera, Film,
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { alertError } from '../utils/sweetAlert';
import Swal from 'sweetalert2';

const last10 = (m) => String(m || '').replace(/\D/g, '').slice(-10);
const MAX_MEDIA = 6;
const MAX_VIDEO_MB = 25; // Google Apps Script base64 upload ceiling — keep videos short.

// Relative "time ago" string.
function timeAgo(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24); if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

// Downscale an image file to a JPEG data URI (keeps uploads light).
function downscaleImage_(file, maxDim = 1600, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height > width && height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        try { resolve(canvas.toDataURL('image/jpeg', quality)); } catch (e) { reject(e); }
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}
function fileToDataUrl_(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

export default function FeedPage({ user }) {
  const isAdmin = user?.role === 'Admin';
  const me = useMemo(() => {
    const list = dataService.getDevotees();
    let d = user?.devoteeId ? list.find((x) => x.id === user.devoteeId) : null;
    if (!d && user?.mobile) d = list.find((x) => last10(x.mobile) === last10(user.mobile));
    return d || null;
  }, [user]);
  const myId = me?.id || user?.devoteeId || user?.mobile || '';
  const myName = me?.name || user?.name || 'Member';
  const myMobile = me?.mobile || user?.mobile || '';

  const [posts, setPosts] = useState([]);
  const [liked, setLiked] = useState(() => new Set());
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Composer state
  const [caption, setCaption] = useState('');
  const [description, setDescription] = useState('');
  const [picks, setPicks] = useState([]); // { dataUri, type, name }
  const [posting, setPosting] = useState(false);
  const [progress, setProgress] = useState('');

  const load = async (reset = true) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const before = reset ? '' : (posts[posts.length - 1]?.createdOn || '');
      const r = await dataService.getFeed({ before, limit: 12, devoteeId: myId });
      setPosts((prev) => (reset ? r.posts : [...prev, ...r.posts]));
      setHasMore(r.hasMore);
      if (reset) setLiked(new Set(r.liked));
      else setLiked((prev) => { const n = new Set(prev); r.liked.forEach((id) => n.add(id)); return n; });
    } catch (e) {
      if (reset) setPosts([]);
    } finally { setLoading(false); setLoadingMore(false); }
  };

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [myId]);

  // ── Composer ───────────────────────────────────────────────────────────────
  const pickMedia = async (e, kind) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = MAX_MEDIA - picks.length;
    const chosen = files.slice(0, room);
    const next = [];
    for (const f of chosen) {
      const isVideo = (f.type || '').startsWith('video') || kind === 'video';
      if (isVideo) {
        if (f.size > MAX_VIDEO_MB * 1024 * 1024) {
          alertError('Video too large', `Please pick a video under ${MAX_VIDEO_MB} MB (a short clip). Longer videos aren't supported yet.`);
          continue;
        }
        try { next.push({ dataUri: await fileToDataUrl_(f), type: 'video', name: f.name }); } catch { /* skip */ }
      } else {
        try { next.push({ dataUri: await downscaleImage_(f), type: 'image', name: f.name }); } catch { /* skip */ }
      }
    }
    if (next.length) setPicks((p) => [...p, ...next].slice(0, MAX_MEDIA));
  };
  const removePick = (i) => setPicks((p) => p.filter((_, idx) => idx !== i));

  const canPost = (caption.trim() || description.trim() || picks.length) && !posting;

  const submit = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      const media = [];
      for (let i = 0; i < picks.length; i++) {
        setProgress(`Uploading ${picks[i].type} ${i + 1} of ${picks.length}…`);
        const { url, mediaType } = await dataService.uploadFeedMedia(picks[i].dataUri, myId);
        media.push({ type: picks[i].type || mediaType, url });
      }
      setProgress('Posting…');
      const post = await dataService.createPost({
        authorId: myId, authorName: myName, authorMobile: myMobile,
        caption: caption.trim(), description: description.trim(), media,
      });
      // Optimistic prepend.
      setPosts((prev) => [post, ...prev]);
      setCaption(''); setDescription(''); setPicks([]);
    } catch (e) {
      alertError('Could not post', e.message);
    } finally { setPosting(false); setProgress(''); }
  };

  // ── Post actions ─────────────────────────────────────────────────────────────
  const toggleLike = async (post) => {
    const on = !liked.has(post.id);
    // Optimistic
    setLiked((prev) => { const n = new Set(prev); on ? n.add(post.id) : n.delete(post.id); return n; });
    setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, likeCount: Math.max(0, (Number(p.likeCount) || 0) + (on ? 1 : -1)) } : p));
    try {
      const r = await dataService.toggleFeedLike({ postId: post.id, devoteeId: myId, name: myName, on });
      setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, likeCount: r.likeCount } : p));
    } catch (e) {
      // Revert on failure
      setLiked((prev) => { const n = new Set(prev); on ? n.delete(post.id) : n.add(post.id); return n; });
      setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, likeCount: Math.max(0, (Number(p.likeCount) || 0) + (on ? -1 : 1)) } : p));
    }
  };

  const deletePost = async (post) => {
    const res = await Swal.fire({
      icon: 'warning', title: 'Delete this post?', text: 'This removes it for everyone.',
      showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#dc2626', cancelButtonText: 'Cancel',
      customClass: { popup: 'rounded-3xl font-sans', confirmButton: 'rounded-2xl px-6 py-2.5 font-bold', cancelButton: 'rounded-2xl px-6 py-2.5 font-bold' },
    });
    if (!res.isConfirmed) return;
    const prev = posts;
    setPosts((p) => p.filter((x) => x.id !== post.id));
    try {
      await dataService.deletePost(post.id, { requesterId: myId, isAdmin });
    } catch (e) {
      setPosts(prev);
      alertError('Could not delete', e.message);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-5 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] text-white shadow-md shadow-primary/30">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-text-main leading-tight">Feed</h1>
          <p className="text-xs text-text-muted">Share moments with the Mandal</p>
        </div>
      </div>

      {/* Composer */}
      <div className="mt-4 rounded-3xl border border-border-light bg-surface p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
            {myName[0] || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200}
              placeholder={`What's happening, ${String(myName).split(' ')[0]}?`}
              className="w-full bg-transparent text-sm font-semibold text-text-main outline-none placeholder:text-text-muted" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={description ? 3 : 1}
              placeholder="Add a description (optional)…"
              className="mt-1 w-full resize-none bg-transparent text-sm text-text-main outline-none placeholder:text-text-muted" />
          </div>
        </div>

        {/* Media previews */}
        {picks.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {picks.map((p, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-xl bg-bg-base">
                {p.type === 'video'
                  ? <video src={p.dataUri} className="h-full w-full object-cover" muted />
                  : <img src={p.dataUri} alt="" className="h-full w-full object-cover" />}
                {p.type === 'video' && <span className="absolute left-1 top-1 rounded-md bg-black/60 px-1 py-0.5"><Film className="h-3 w-3 text-white" /></span>}
                <button onClick={() => removePick(i)} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {posting && progress && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between border-t border-border-light pt-2">
          <div className="flex items-center gap-1">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
              <ImageIcon className="h-4 w-4" /> Photo
              <input type="file" accept="image/*" multiple onChange={(e) => pickMedia(e, 'image')} className="hidden" disabled={posting} />
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40">
              <Camera className="h-4 w-4" /> Camera
              <input type="file" accept="image/*" capture="environment" onChange={(e) => pickMedia(e, 'image')} className="hidden" disabled={posting} />
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
              <Video className="h-4 w-4" /> Video
              <input type="file" accept="video/*" onChange={(e) => pickMedia(e, 'video')} className="hidden" disabled={posting} />
            </label>
          </div>
          <button onClick={submit} disabled={!canPost}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#FF9D52] to-[#E56F18] px-4 py-2 text-sm font-bold text-white shadow-md shadow-primary/30 transition-opacity disabled:opacity-40">
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Post
          </button>
        </div>
      </div>

      {/* Feed */}
      <div className="mt-4 space-y-4">
        {loading && (
          <>
            {[0, 1].map((i) => (
              <div key={i} className="animate-pulse rounded-3xl border border-border-light bg-surface p-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-bg-base" />
                  <div className="h-3 w-28 rounded bg-bg-base" />
                </div>
                <div className="mt-3 aspect-video rounded-2xl bg-bg-base" />
              </div>
            ))}
          </>
        )}

        {!loading && posts.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border-light bg-surface p-10 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-text-muted" />
            <p className="mt-2 text-sm font-semibold text-text-main">No posts yet</p>
            <p className="text-xs text-text-muted">Be the first to share something with the Mandal.</p>
          </div>
        )}

        {posts.map((post) => (
          <PostCard key={post.id} post={post} liked={liked.has(post.id)}
            canDelete={isAdmin || String(post.authorId) === String(myId)}
            onToggleLike={() => toggleLike(post)} onDelete={() => deletePost(post)}
            me={{ myId, myName, isAdmin }} />
        ))}

        {hasMore && !loading && (
          <button onClick={() => load(false)} disabled={loadingMore}
            className="w-full rounded-2xl border border-border-light bg-surface py-3 text-sm font-bold text-text-muted transition-colors hover:text-text-main disabled:opacity-50">
            {loadingMore ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span> : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Single post card ─────────────────────────────────────────────────────────
function PostCard({ post, liked, canDelete, onToggleLike, onDelete, me }) {
  const media = useMemo(() => { try { return JSON.parse(post.mediaJson || '[]'); } catch { return []; } }, [post.mediaJson]);
  const [idx, setIdx] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(null); // null = not loaded
  const [cText, setCText] = useState('');
  const [cSending, setCSending] = useState(false);
  const [count, setCount] = useState(Number(post.commentCount) || 0);
  const [expanded, setExpanded] = useState(false);
  const descLong = String(post.description || '').length > 180;

  const openComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && comments === null) {
      const list = await dataService.getFeedComments(post.id);
      setComments(list);
      setCount(list.length);
    }
  };

  const addComment = async () => {
    const text = cText.trim();
    if (!text || cSending) return;
    setCSending(true);
    try {
      const { comment, commentCount } = await dataService.addFeedComment({ postId: post.id, authorId: me.myId, authorName: me.myName, text });
      setComments((prev) => [...(prev || []), comment]);
      setCount(commentCount);
      setCText('');
    } catch (e) {
      alertError('Could not comment', e.message);
    } finally { setCSending(false); }
  };

  const delComment = async (c) => {
    const prev = comments;
    setComments((cs) => cs.filter((x) => x.id !== c.id));
    setCount((n) => Math.max(0, n - 1));
    try {
      await dataService.deleteFeedComment(c.id, { requesterId: me.myId, isAdmin: me.isAdmin });
    } catch (e) {
      setComments(prev); setCount((n) => n + 1); alertError('Could not delete', e.message);
    }
  };

  return (
    <article className="overflow-hidden rounded-3xl border border-border-light bg-surface shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
          {String(post.authorName || 'U')[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text-main">{post.authorName || 'Member'}</p>
          <p className="text-[11px] text-text-muted">{timeAgo(post.createdOn)}</p>
        </div>
        {canDelete && (
          <button onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Caption (above media, Instagram-ish when there's no media) */}
      {post.caption && <p className="px-4 pb-2 text-sm font-semibold text-text-main">{post.caption}</p>}

      {/* Media carousel */}
      {media.length > 0 && (
        <div className="relative bg-black">
          <div className="aspect-square w-full">
            {media[idx]?.type === 'video'
              ? <video src={media[idx].url} controls playsInline className="h-full w-full bg-black object-contain" />
              : <img src={media[idx]?.url} alt="" loading="lazy" className="h-full w-full object-contain" />}
          </div>
          {media.length > 1 && (
            <>
              {idx > 0 && (
                <button onClick={() => setIdx((i) => i - 1)} className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white">
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {idx < media.length - 1 && (
                <button onClick={() => setIdx((i) => i + 1)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white">
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
                {media.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 px-4 pt-3">
        <button onClick={onToggleLike} className="flex items-center gap-1.5 text-sm font-bold">
          <Heart className={`h-6 w-6 transition-transform active:scale-125 ${liked ? 'fill-rose-500 text-rose-500' : 'text-text-main'}`} />
          {Number(post.likeCount) > 0 && <span className={liked ? 'text-rose-500' : 'text-text-main'}>{post.likeCount}</span>}
        </button>
        <button onClick={openComments} className="flex items-center gap-1.5 text-sm font-bold text-text-main">
          <MessageCircle className="h-6 w-6" />
          {count > 0 && <span>{count}</span>}
        </button>
      </div>

      {/* Description */}
      {post.description && (
        <p className="whitespace-pre-wrap px-4 pb-1 pt-2 text-sm text-text-main">
          {descLong && !expanded ? String(post.description).slice(0, 180) + '… ' : post.description}
          {descLong && (
            <button onClick={() => setExpanded((e) => !e)} className="font-semibold text-text-muted">{expanded ? ' less' : 'more'}</button>
          )}
        </p>
      )}

      {/* Comments */}
      {showComments && (
        <div className="border-t border-border-light px-4 py-3">
          {comments === null ? (
            <div className="flex items-center gap-2 text-xs text-text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading comments…</div>
          ) : (
            <>
              {comments.length === 0 && <p className="text-xs text-text-muted">No comments yet — say something kind.</p>}
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="group flex items-start gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-base text-[10px] font-bold text-text-muted">
                      {String(c.authorName || 'U')[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-main">
                        <span className="font-bold">{c.authorName || 'Member'}</span>{' '}
                        <span className="whitespace-pre-wrap">{c.text}</span>
                      </p>
                      <p className="text-[10px] text-text-muted">{timeAgo(c.createdOn)}</p>
                    </div>
                    {(me.isAdmin || String(c.authorId) === String(me.myId)) && (
                      <button onClick={() => delComment(c)} className="shrink-0 text-text-muted opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {/* Add comment */}
          <div className="mt-3 flex items-center gap-2">
            <input value={cText} onChange={(e) => setCText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addComment(); }}
              placeholder="Add a comment…" maxLength={1000}
              className="flex-1 rounded-full border border-border-light bg-bg-base px-3.5 py-2 text-sm text-text-main outline-none placeholder:text-text-muted focus:border-primary" />
            <button onClick={addComment} disabled={!cText.trim() || cSending}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40">
              {cSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {!post.caption && !post.description && media.length === 0 && (
        <div className="px-4 pb-3" />
      )}
      <div className="pb-2" />
    </article>
  );
}
