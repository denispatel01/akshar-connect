import { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';

/**
 * Tracks whether the Feed has posts newer than what this device last viewed.
 * Shared by the desktop Sidebar and the mobile bottom bar so there's one check,
 * one source of truth for the green "new post" dot. Returns [hasNewFeed, clear].
 */
export function useNewFeed() {
  const [hasNewFeed, setHasNewFeed] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await dataService.getFeed({ limit: 1 });
        const newest = (r.posts && r.posts[0] && r.posts[0].createdOn) || '';
        let seen = '';
        try { seen = localStorage.getItem('ac-feed-seen') || ''; } catch (e) {}
        if (alive) setHasNewFeed(!!newest && String(newest) > String(seen));
      } catch (e) { /* offline — no dot */ }
    };
    check();
    const onSeen = () => setHasNewFeed(false);
    const onRefresh = () => check();
    window.addEventListener('ac-feed-seen', onSeen);
    window.addEventListener('ac-data-refreshed', onRefresh);
    return () => {
      alive = false;
      window.removeEventListener('ac-feed-seen', onSeen);
      window.removeEventListener('ac-data-refreshed', onRefresh);
    };
  }, []);

  return [hasNewFeed, () => setHasNewFeed(false)];
}
