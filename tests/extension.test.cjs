const vm = require('node:vm'),
  fs = require('node:fs'),
  assert = require('node:assert/strict'),
  { test } = require('node:test');

const captureScript = fs.readFileSync('browser-extension/capture.js', 'utf8');
const contentScript = fs.readFileSync('browser-extension/content.js', 'utf8');

async function simulate(platform) {
  const store = {};
  const url =
    platform === 'x'
      ? 'https://x.com/alice/status/123'
      : platform === 'instagram'
      ? 'https://www.instagram.com/p/ABC/'
      : 'https://web.whatsapp.com/';
  const link = { href: url };
  const article =
    platform === 'x'
      ? {
          querySelector: s =>
            s === 'time'
              ? { dateTime: '2026-01-01T00:00:00Z', closest: () => link }
              : s === '[data-testid="User-Name"]'
              ? { innerText: 'Alice\n@alice' }
              : s === '[data-testid="tweetText"]'
              ? { innerText: 'Texto original visible' }
              : null,
          querySelectorAll: s =>
            s === '[data-testid="tweetPhoto"] img' ? [{ src: 'https://pbs.twimg.com/a.jpg' }] : []
        }
      : {
          querySelector: s =>
            s === 'h1'
              ? { innerText: 'Caption visible de Instagram' }
              : s === 'header a'
              ? { textContent: 'Alice' }
              : null,
          querySelectorAll: () => []
        };

  const ctx = {
    URL,
    Date,
    Set,
    Map,
    Promise,
    Error,
    console,
    setTimeout: f => setTimeout(f, 0),
    location: new URL(url),
    window: { scrollY: 100, innerHeight: 800, scrollBy: () => {} },
    document: {
      querySelectorAll: s => (platform === 'x' && s === 'article[data-testid="tweet"]' ? [article] : []),
      querySelector: () => article
    },
    chrome: {
      storage: {
        local: {
          get: async keys =>
            typeof keys === 'string'
              ? { [keys]: store[keys] }
              : Object.fromEntries(keys.map(k => [k, store[k]])),
          set: async object => Object.assign(store, object)
        }
      }
    },
    alert: () => {
      throw Error('Unexpected alert');
    }
  };
  vm.createContext(ctx);
  vm.runInContext(captureScript, ctx);
  for (let i = 0; i < 100 && ctx.__atlasRunning; i++) {
    await new Promise(r => setTimeout(r, 2));
  }
  assert.equal(ctx.__atlasRunning, false);
  return store['atlas-capture-' + platform];
}

test('extension captures X text and persists a checkpoint', async () => {
  const s = await simulate('x');
  assert.equal(s.count, 1);
  const item = Object.values(s.items)[0];
  assert.equal(item.caption, 'Texto original visible');
  assert.equal(item.authorHandle, '@alice');
  assert.equal(item.savedAt, undefined);
  assert.equal(item.mediaUrls.length, 1);
});

test('extension captures Instagram individual caption without inventing saved time', async () => {
  const s = await simulate('instagram');
  assert.equal(s.count, 1);
  const item = Object.values(s.items)[0];
  assert.equal(item.caption, 'Caption visible de Instagram');
  assert.equal(item.sourceUrl, 'https://www.instagram.com/p/ABC/');
  assert.equal(item.savedAt, undefined);
});

test('extension v3.0 extracts WhatsApp Web messages with links and deduplicates YouTube / Awesome page repo lists', async () => {
  const ctx = {
    URL,
    Date,
    Set,
    Map,
    Promise,
    Error,
    console,
    decodeURIComponent
  };
  vm.createContext(ctx);
  vm.runInContext(contentScript, ctx);

  // Verify all required functions are exposed on content.js
  assert.equal(typeof ctx.extractX, 'function');
  assert.equal(typeof ctx.extractInstagram, 'function');
  assert.equal(typeof ctx.extractGitHubRepoPage, 'function');
  assert.equal(typeof ctx.extractWhatsAppWeb, 'function');
  assert.equal(typeof ctx.extractPageRepoList, 'function');
  assert.equal(typeof ctx.collectVisible, 'function');
  assert.equal(typeof ctx.mergeCaptured, 'function');

  // 1. Test WhatsApp Web DOM extraction (div[data-pre-plain-text], span.selectable-text, a[href^="http"])
  const waMsgWithLinks = {
    getAttribute: attr => (attr === 'data-pre-plain-text' ? '[08/11/2026, 14:35] Martín: ' : null),
    querySelectorAll: sel => {
      if (sel === 'span.selectable-text') {
        return [{ innerText: 'Mirá este repo github.com/vercel/ai y el post en X' }];
      }
      if (sel === 'a[href^="http"]') {
        return [{ href: 'https://x.com/vercel/status/987654321' }];
      }
      return [];
    }
  };
  const waMsgNoLinks = {
    getAttribute: attr => (attr === 'data-pre-plain-text' ? '[08/11/2026, 14:36] Martín: ' : null),
    querySelectorAll: sel => {
      if (sel === 'span.selectable-text') {
        return [{ innerText: 'Hola, todo bien sin enlaces' }];
      }
      return [];
    }
  };
  const waDoc = {
    querySelectorAll: sel => (sel === 'div[data-pre-plain-text]' ? [waMsgWithLinks, waMsgNoLinks] : [])
  };

  const waExtracted = ctx.extractWhatsAppWeb(waDoc, new URL('https://web.whatsapp.com/'));
  assert.equal(waExtracted.length, 1);
  assert.equal(waExtracted[0].sender, 'Martín');
  assert.equal(waExtracted[0].date, '08/11/2026, 14:35');
  assert.ok(waExtracted[0].urls.includes('https://github.com/vercel/ai'));
  assert.ok(waExtracted[0].urls.includes('https://x.com/vercel/status/987654321'));
  assert.match(
    waExtracted.formattedText,
    /^\[08\/11\/2026, 14:35\] Martín: Mirá este repo github\.com\/vercel\/ai/
  );

  // 2. Test YouTube & Awesome List page repository extraction with automatic deduplication
  const ytDoc = {
    querySelectorAll: sel => {
      if (sel === 'a[href^="http"]' || sel === 'a[href*="github.com"]' || sel === 'a[href]') {
        return [
          {
            href: 'https://www.youtube.com/redirect?event=video_description&q=https%3A%2F%2Fgithub.com%2Fupscayl%2Fupscayl',
            innerText: 'Upscayl AI Image Upscaler'
          },
          {
            href: 'https://github.com/upscayl/upscayl/releases',
            innerText: 'Duplicate Upscayl release link'
          },
          {
            href: 'https://github.com/punkpeye/awesome-mcp-servers',
            innerText: 'Awesome MCP Servers list'
          },
          {
            href: 'https://github.com/trending/typescript',
            innerText: 'Reserved trending page (must be ignored)'
          }
        ];
      }
      return [];
    },
    querySelector: sel =>
      sel === '#description'
        ? { innerText: 'También usamos https://github.com/BuilderIO/gpt-crawler en el video.' }
        : null
  };

  const pageRepos = ctx.extractPageRepoList(ytDoc, new URL('https://www.youtube.com/watch?v=demo123'));
  assert.equal(pageRepos.length, 3);
  assert.deepEqual([...pageRepos.fullNames], [
    'upscayl/upscayl',
    'punkpeye/awesome-mcp-servers',
    'BuilderIO/gpt-crawler'
  ]);
});
