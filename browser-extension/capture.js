(() => {
  globalThis.__atlasForceStart = true;
  const GITHUB_RESERVED = new Set([
    'about', 'pricing', 'features', 'explore', 'topics', 'trending', 'collections',
    'events', 'security', 'enterprise', 'customer-stories', 'readme', 'marketplace',
    'pulls', 'issues', 'notifications', 'settings', 'login', 'signup', 'orgs',
    'users', 'stars', 'site', 'support', 'contact', 'git-guides', 'solutions',
    'new', 'organizations', 'join', 'codespaces', 'sponsors', 'sessions', 'search',
    'discussions', 'dashboard', 'team', 'apps', 'account', 'personal-access-tokens', 'billing'
  ]);

  function detectPlatform(loc = globalThis.location) {
    const host = String(loc?.hostname || '').toLowerCase().replace(/^www\./, '');
    if (host === 'instagram.com') return 'instagram';
    if (host === 'x.com' || host === 'twitter.com') return 'x';
    if (host === 'web.whatsapp.com') return 'whatsapp';
    if (host === 'github.com') return 'github';
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') return 'youtube';
    return 'web';
  }

  function canonicalUrl(href, platform, origin) {
    try {
      const base = origin || globalThis.location?.origin || 'https://x.com';
      const u = new URL(href, base);
      let m;
      if (platform === 'x' && /^(www\.)?(x|twitter)\.com$/.test(u.hostname) && (m = u.pathname.match(/\/status\/(\d+)/))) {
        return `https://x.com/i/web/status/${m[1]}`;
      }
      if (platform === 'instagram' && /^(www\.)?instagram\.com$/.test(u.hostname) && (m = u.pathname.match(/^\/(p|reel|reels|tv)\/([\w-]+)/))) {
        return `https://www.instagram.com/p/${m[2]}/`;
      }
      if (platform === 'github' && /^(www\.)?github\.com$/.test(u.hostname)) {
        const gm = u.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
        if (gm) {
          const owner = gm[1];
          const repo = gm[2].replace(/\.git$/i, '');
          if (!GITHUB_RESERVED.has(owner.toLowerCase()) && !GITHUB_RESERVED.has(repo.toLowerCase())) {
            return `https://github.com/${owner}/${repo}`;
          }
        }
      }
    } catch {}
    return null;
  }

  function parseGitHubRepoUrl(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') return null;
    let candidate = rawInput.trim();
    try {
      if (/youtube\.com\/redirect/i.test(candidate)) {
        const u = new URL(candidate, 'https://www.youtube.com');
        const q = u.searchParams.get('q') || u.searchParams.get('url');
        if (q) candidate = decodeURIComponent(q);
      }
    } catch {}

    const m = candidate.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)/i);
    if (!m) return null;
    const owner = m[1].trim();
    let repo = m[2].trim().replace(/[.,;:!?)\],'">]+$/, '');
    if (repo.endsWith('.git')) repo = repo.slice(0, -4);
    repo = repo.replace(/\/+$/, '');
    if (!owner || !repo) return null;
    if (GITHUB_RESERVED.has(owner.toLowerCase()) || GITHUB_RESERVED.has(repo.toLowerCase())) return null;
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      url: `https://github.com/${owner}/${repo}`,
      cleanUrl: `https://github.com/${owner}/${repo}`
    };
  }

  function extractX(doc = globalThis.document, loc = globalThis.location) {
    const rows = [];
    const articles = doc?.querySelectorAll ? [...doc.querySelectorAll('article[data-testid="tweet"]')] : [];
    for (const article of articles) {
      const time = article.querySelector?.('time');
      const link = time?.closest?.('a') || article.querySelector?.('a[href*="/status/"]');
      if (!link) continue;
      const sourceUrl = canonicalUrl(link.href, 'x', loc?.origin);
      if (!sourceUrl) continue;
      const user = article.querySelector?.('[data-testid="User-Name"]')?.innerText || '';
      const handle = user.match(/@[\w]+/)?.[0] || '';
      const photoEls = article.querySelectorAll ? [...article.querySelectorAll('[data-testid="tweetPhoto"] img')] : [];
      const linkEls = article.querySelectorAll ? [...article.querySelectorAll('[data-testid="tweetText"] a')] : [];
      rows.push({
        sourceUrl,
        caption: article.querySelector?.('[data-testid="tweetText"]')?.innerText || '',
        authorName: user.split('\n')[0] || handle,
        authorHandle: handle,
        publishedAt: time?.dateTime || '',
        mediaUrls: photoEls.map(i => i.currentSrc || i.src).filter(Boolean),
        outgoingLinks: linkEls.map(a => a.href).filter(h => /^https?:/.test(h))
      });
    }
    return rows;
  }

  function extractInstagram(doc = globalThis.document, loc = globalThis.location) {
    const rows = [];
    const links = doc?.querySelectorAll ? [...doc.querySelectorAll('main a[href], article a[href]')] : [];
    for (const link of links) {
      const sourceUrl = canonicalUrl(link.href, 'instagram', loc?.origin);
      if (!sourceUrl) continue;
      const imgs = link.querySelectorAll ? [...link.querySelectorAll('img')] : [];
      rows.push({
        sourceUrl,
        caption: '',
        mediaUrls: imgs.map(i => i.currentSrc || i.src).filter(Boolean)
      });
    }
    const isPost = /^\/(p|reel|reels|tv)\//.test(loc?.pathname || '');
    if (isPost) {
      const article = doc?.querySelector?.('article') || doc?.querySelector?.('main');
      const sourceUrl = canonicalUrl(loc?.href, 'instagram', loc?.origin);
      if (article && sourceUrl) {
        const imgs = article.querySelectorAll ? [...article.querySelectorAll('img')] : [];
        rows.push({
          sourceUrl,
          caption: article.querySelector?.('h1')?.innerText || '',
          authorName: article.querySelector?.('header a')?.textContent || '',
          publishedAt: article.querySelector?.('time')?.dateTime || '',
          mediaUrls: imgs.filter(i => i.naturalWidth > 200).map(i => i.currentSrc || i.src).filter(Boolean)
        });
      }
    }
    return rows;
  }

  function extractGitHubRepoPage(doc = globalThis.document, loc = globalThis.location) {
    const parsed = parseGitHubRepoUrl(loc?.href || '');
    if (!parsed) return null;
    const aboutEl =
      doc?.querySelector?.('[itemprop="about"]') ||
      doc?.querySelector?.('.BorderGrid-cell p.f4') ||
      doc?.querySelector?.('meta[name="description"]');
    const description = (aboutEl?.innerText || aboutEl?.textContent || aboutEl?.content || '').trim();
    return {
      ...parsed,
      sourceUrl: parsed.url,
      description
    };
  }

  function extractLinksFromTextAndAnchors(text, anchors = []) {
    const found = [];
    const pushClean = raw => {
      if (!raw || typeof raw !== 'string') return;
      let clean = raw.trim().replace(/[.,;:!?)\],'">]+$/, '');
      if (!clean) return;
      if (!/^https?:\/\//i.test(clean)) {
        clean = `https://${clean.replace(/^www\./i, '')}`;
      }
      if (!found.includes(clean)) found.push(clean);
    };

    for (const a of anchors) {
      const href = a?.href || a?.getAttribute?.('href') || '';
      if (/^https?:\/\//i.test(href) && !href.includes('web.whatsapp.com')) {
        pushClean(href);
      }
    }

    const str = String(text || '');
    const httpMatches = str.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
    for (const m of httpMatches) pushClean(m);

    const bareMatches =
      str.match(/(?<![/:a-zA-Z0-9])(?:www\.)?(?:github\.com|x\.com|twitter\.com|instagram\.com|t\.co|youtu\.be|youtube\.com)\/[^\s<>"')\]]+/gi) || [];
    for (const m of bareMatches) pushClean(m);

    return found;
  }

  function parsePrePlainTextHeader(rawHeader) {
    const raw = String(rawHeader || '').trim();
    if (!raw) {
      return { date: '08/11/2026, 10:00', sender: 'WhatsApp Web' };
    }
    const bracketMatch = raw.match(/^\[([^\]]+)\]\s*([^:]+?):?\s*$/);
    if (bracketMatch) {
      return {
        date: bracketMatch[1].trim(),
        sender: bracketMatch[2].trim() || 'Contacto WA'
      };
    }
    const dashMatch = raw.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*([^:]+?):?\s*$/);
    if (dashMatch) {
      return {
        date: dashMatch[1].trim(),
        sender: dashMatch[2].trim() || 'Contacto WA'
      };
    }
    return {
      date: '08/11/2026, 10:00',
      sender: raw.replace(/:$/, '').trim() || 'WhatsApp Web'
    };
  }

  function extractWhatsAppWeb(doc = globalThis.document, loc = globalThis.location) {
    const results = [];
    const seenLines = new Set();

    const msgNodes = doc?.querySelectorAll
      ? [...doc.querySelectorAll('div[data-pre-plain-text]')]
      : [];

    const processNode = (node, fallbackHeader) => {
      const rawPre =
        node?.getAttribute?.('data-pre-plain-text') ||
        node?.dataset?.prePlainText ||
        node?.['data-pre-plain-text'] ||
        node?.prePlainText ||
        fallbackHeader ||
        '';
      const { date, sender } = parsePrePlainTextHeader(rawPre);

      const selectableSpans = node?.querySelectorAll
        ? [...node.querySelectorAll('span.selectable-text')]
        : [];
      const singleSpan = !selectableSpans.length && node?.querySelector
        ? node.querySelector('span.selectable-text')
        : null;
      if (singleSpan) selectableSpans.push(singleSpan);

      let text = selectableSpans.length
        ? selectableSpans.map(s => s.innerText || s.textContent || '').filter(Boolean).join(' ')
        : (node?.innerText || node?.textContent || '');
      text = String(text || '').replace(/\r?\n+/g, ' ').trim();

      const anchors = node?.querySelectorAll
        ? [...node.querySelectorAll('a[href^="http"]')]
        : [];
      const urls = extractLinksFromTextAndAnchors(text, anchors);
      if (urls.length === 0) return;

      for (const u of urls) {
        const bare = u.replace(/^https?:\/\/(www\.)?/i, '');
        if (!text.includes(u) && !text.includes(bare)) {
          text = text ? `${text} ${u}` : u;
        }
      }

      const formattedLine = `[${date}] ${sender}: ${text}`;
      if (seenLines.has(formattedLine)) return;
      seenLines.add(formattedLine);

      results.push({
        date,
        sender,
        text,
        urls,
        formattedLine,
        sourceUrl: urls[0],
        caption: text,
        authorName: sender,
        outgoingLinks: urls,
        hasLinks: true
      });
    };

    if (msgNodes.length > 0) {
      for (const node of msgNodes) {
        processNode(node);
      }
    } else if (doc?.querySelectorAll) {
      const spans = [...doc.querySelectorAll('span.selectable-text')];
      if (spans.length > 0) {
        for (const span of spans) {
          processNode(span, span?.getAttribute?.('data-pre-plain-text') || '');
        }
      } else {
        const links = [...doc.querySelectorAll('a[href^="http"]')];
        for (const a of links) {
          processNode({
            innerText: a.innerText || a.textContent || a.href || '',
            querySelectorAll: s => (s === 'a[href^="http"]' ? [a] : [])
          });
        }
      }
    }

    results.messages = results;
    results.lines = results.map(r => r.formattedLine);
    results.formattedText = results.lines.join('\n');
    results.text = results.formattedText;
    return results;
  }

  function extractPageRepoList(doc = globalThis.document, loc = globalThis.location) {
    const byKey = new Map();

    const addCandidate = (rawUrl, hint = '') => {
      const parsed = parseGitHubRepoUrl(rawUrl);
      if (!parsed) return;
      const key = `${parsed.owner.toLowerCase()}/${parsed.repo.toLowerCase()}`;
      const cleanHint = String(hint || '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          owner: parsed.owner,
          repo: parsed.repo,
          fullName: parsed.fullName,
          url: parsed.url,
          cleanUrl: parsed.cleanUrl,
          sourceUrl: parsed.url,
          caption: cleanHint,
          contextHint: cleanHint.length >= 4 ? cleanHint.slice(0, 240) : ''
        });
      } else if (!existing.contextHint && cleanHint.length >= 4) {
        existing.contextHint = cleanHint.slice(0, 240);
        existing.caption = existing.contextHint;
      }
    };

    if (doc?.querySelectorAll) {
      const anchorSelectors = ['a[href^="http"]', 'a[href*="github.com"]', 'a[href]'];
      const seenElements = new Set();
      for (const sel of anchorSelectors) {
        const els = [...(doc.querySelectorAll(sel) || [])];
        for (const a of els) {
          if (seenElements.has(a)) continue;
          seenElements.add(a);
          const href = a.href || a.getAttribute?.('href') || '';
          const textHint = a.innerText || a.textContent || a.title || '';
          addCandidate(href, textHint);
        }
      }
    }

    const textContainers = [];
    if (doc?.querySelector) {
      for (const sel of ['#description-inline-expander', '#description', 'ytd-watch-metadata', 'article', 'main']) {
        const el = doc.querySelector(sel);
        if (el && (el.innerText || el.textContent)) {
          textContainers.push(el.innerText || el.textContent);
        }
      }
    }
    if (doc?.body && (doc.body.innerText || doc.body.textContent)) {
      textContainers.push(doc.body.innerText || doc.body.textContent);
    }

    const regex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)/gi;
    for (const block of textContainers) {
      const lines = String(block).split(/\r?\n/);
      for (const line of lines) {
        let match;
        regex.lastIndex = 0;
        while ((match = regex.exec(line)) !== null) {
          addCandidate(match[0], line);
        }
      }
    }

    if (loc?.href && /github\.com\//i.test(loc.href)) {
      const repoPage = extractGitHubRepoPage(doc, loc);
      if (repoPage) {
        addCandidate(repoPage.url, repoPage.description);
      }
    }

    const results = Array.from(byKey.values());
    results.repos = results;
    results.urls = results.map(r => r.url);
    results.fullNames = results.map(r => r.fullName);
    results.text = results
      .map(r => (r.contextHint ? `${r.url} - ${r.contextHint}` : r.url))
      .join('\n');
    results.count = results.length;
    results.pageUrl = loc?.href || '';
    return results;
  }

  function collectVisible(platform, doc = globalThis.document, loc = globalThis.location) {
    const p = platform || detectPlatform(loc);
    if (p === 'x') return extractX(doc, loc);
    if (p === 'instagram') return extractInstagram(doc, loc);
    if (p === 'whatsapp') return extractWhatsAppWeb(doc, loc);
    if (p === 'github' || p === 'youtube' || p === 'web') return extractPageRepoList(doc, loc);
    return [];
  }

  function mergeCaptured(prevItems = {}, newRows = []) {
    const items = { ...(prevItems || {}) };
    const list = Array.isArray(newRows) ? newRows : Object.values(newRows || {});
    for (const row of list) {
      if (!row) continue;
      const url = row.sourceUrl || row.url || row.cleanUrl || row.formattedLine;
      if (!url) continue;
      const prev = items[url] || {};
      const merged = {
        ...prev,
        ...row,
        sourceUrl: url,
        caption: row.caption || prev.caption || ''
      };
      if (prev.mediaUrls || row.mediaUrls) {
        merged.mediaUrls = [...new Set([...(prev.mediaUrls || []), ...(row.mediaUrls || [])])];
      }
      if (prev.outgoingLinks || row.outgoingLinks) {
        merged.outgoingLinks = [...new Set([...(prev.outgoingLinks || []), ...(row.outgoingLinks || [])])];
      }
      items[url] = merged;
    }
    return items;
  }

  globalThis.extractX = extractX;
  globalThis.extractInstagram = extractInstagram;
  globalThis.extractGitHubRepoPage = extractGitHubRepoPage;
  globalThis.extractWhatsAppWeb = extractWhatsAppWeb;
  globalThis.extractPageRepoList = extractPageRepoList;
  globalThis.collectVisible = collectVisible;
  globalThis.mergeCaptured = mergeCaptured;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      extractX,
      extractInstagram,
      extractGitHubRepoPage,
      extractWhatsAppWeb,
      extractPageRepoList,
      collectVisible,
      mergeCaptured
    };
  }

  if (globalThis.__atlasRunning) return;

  const platform = detectPlatform(globalThis.location);
  const isSaved =
    platform === 'x'
      ? /^\/i\/bookmarks/.test(globalThis.location.pathname)
      : platform === 'instagram'
      ? /\/saved(?:\/|$)/.test(globalThis.location.pathname)
      : true;
  const isPost =
    platform === 'x'
      ? /\/status\/\d+/.test(globalThis.location.pathname)
      : platform === 'instagram'
      ? /^\/(p|reel|reels|tv)\//.test(globalThis.location.pathname)
      : true;

  if ((platform === 'x' || platform === 'instagram') && !isSaved && !isPost) {
    if (typeof alert === 'function') {
      alert('Atlas: entrá a Guardados o abrí una publicación antes de iniciar.');
    }
    return;
  }

  if (!globalThis.chrome?.storage?.local) return;

  globalThis.__atlasRunning = true;
  const key = `atlas-capture-${platform}`;
  const started = Date.now();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  (async () => {
    const saved = (await chrome.storage.local.get(key))[key] || { items: {}, scroll: 0 };
    let items = saved.items || {};
    await chrome.storage.local.set({ [`${key}-stop`]: false });
    let idle = 0;
    let message = 'Capturando publicaciones visibles…';
    let formattedText = saved.formattedText || '';

    async function persist() {
      const flags = await chrome.storage.local.get(`${key}-reset`);
      if ((flags[`${key}-reset`] || 0) > started) return false;
      const payload = {
        items,
        count: Object.keys(items).length,
        scroll: globalThis.window?.scrollY || 0,
        at: new Date().toISOString(),
        message
      };
      if (formattedText) payload.formattedText = formattedText;
      await chrome.storage.local.set({ [key]: payload });
      return true;
    }

    for (let pass = 0; pass < 10000; pass++) {
      const flags = await chrome.storage.local.get([`${key}-stop`, `${key}-reset`]);
      if ((flags[`${key}-reset`] || 0) > started) return;
      if (flags[`${key}-stop`]) {
        message = 'Pausado. Podés reanudar; los duplicados se combinan.';
        break;
      }

      const before = Object.keys(items).length;
      const visibleRows = collectVisible(platform, globalThis.document, globalThis.location);
      if (platform === 'whatsapp' && visibleRows.formattedText) {
        formattedText = visibleRows.formattedText;
      }
      items = mergeCaptured(items, visibleRows);

      const after = Object.keys(items).length;
      idle = after === before ? idle + 1 : 0;
      message = `${after} elementos conservados. Leyendo la página…`;
      if (!(await persist())) return;

      if (isPost && !globalThis.__atlasScrollLoop) {
        message = 'Contenido visible capturado. Podés sincronizar con Atlas o descargar el JSON.';
        break;
      }
      if (idle >= 10) {
        message = 'No aparecieron elementos nuevos durante 25 segundos. Captura pausada.';
        break;
      }
      globalThis.window?.scrollBy?.({
        top: Math.max(500, (globalThis.window?.innerHeight || 800) * 0.85),
        behavior: 'instant'
      });
      await delay(2500);
    }
    await persist();
  })()
    .catch(async e => {
      const s = (await chrome.storage.local.get(key))[key];
      if (s) {
        await chrome.storage.local.set({
          [key]: { ...s, message: `Error: ${e.message}. Checkpoint conservado.` }
        });
      }
    })
    .finally(() => {
      globalThis.__atlasRunning = false;
      globalThis.__atlasForceStart = false;
    });
})();
