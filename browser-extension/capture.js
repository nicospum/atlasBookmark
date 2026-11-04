(() => {
  if (globalThis.__atlasRunning) return;
  const platform = /(^|\.)instagram\.com$/.test(location.hostname) ? 'instagram' : 'x';
  const isSaved = platform === 'x' ? /^\/i\/bookmarks/.test(location.pathname) : /\/saved(?:\/|$)/.test(location.pathname);
  const isPost = platform === 'x' ? /\/status\/\d+/.test(location.pathname) : /^\/(p|reel|reels|tv)\//.test(location.pathname);
  if (!isSaved && !isPost) { alert('Atlas: entrá a Guardados o abrí una publicación antes de iniciar.'); return; }
  globalThis.__atlasRunning = true;
  const key = `atlas-capture-${platform}`, started = Date.now();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const canonical = href => {
    try { const u = new URL(href, location.origin); let m;
      if (platform === 'x' && /^(www\.)?(x|twitter)\.com$/.test(u.hostname) && (m=u.pathname.match(/\/status\/(\d+)/))) return `https://x.com/i/web/status/${m[1]}`;
      if (platform === 'instagram' && /^(www\.)?instagram\.com$/.test(u.hostname) && (m=u.pathname.match(/^\/(p|reel|reels|tv)\/([\w-]+)/))) return `https://www.instagram.com/p/${m[2]}/`;
    } catch {} return null;
  };
  (async () => {
    const saved = (await chrome.storage.local.get(key))[key] || { items: {}, scroll: 0 };
    const items = saved.items || {};
    await chrome.storage.local.set({ [`${key}-stop`]: false });
    let idle=0, message='Capturando publicaciones visibles…';
    async function persist() { const flags=await chrome.storage.local.get(`${key}-reset`); if((flags[`${key}-reset`]||0)>started)return false; await chrome.storage.local.set({ [key]: { items, count:Object.keys(items).length, scroll:window.scrollY, at:new Date().toISOString(), message } }); return true; }
    function add(url, row) { if (!url) return; const prev=items[url]||{}; items[url]={ ...prev,...row, sourceUrl:url, caption:row.caption||prev.caption||'', mediaUrls:[...new Set([...(prev.mediaUrls||[]),...(row.mediaUrls||[])])] }; }
    for(let pass=0;pass<10000;pass++) {
      const flags=await chrome.storage.local.get([`${key}-stop`,`${key}-reset`]);
      if((flags[`${key}-reset`]||0)>started) return;
      if(flags[`${key}-stop`]) { message='Pausado. Podés reanudar; los duplicados se combinan.';break; }
      const before=Object.keys(items).length;
      if(platform==='x') {
        for(const article of document.querySelectorAll('article[data-testid="tweet"]')) {
          const time=article.querySelector('time'), link=time?.closest('a') || article.querySelector('a[href*="/status/"]');
          if(!link)continue;
          const user=article.querySelector('[data-testid="User-Name"]')?.innerText||'';
          const handle=user.match(/@[\w]+/)?.[0]||'';
          add(canonical(link.href), { caption:article.querySelector('[data-testid="tweetText"]')?.innerText||'', authorName:user.split('\n')[0]||handle, authorHandle:handle, publishedAt:time?.dateTime||'', mediaUrls:[...article.querySelectorAll('[data-testid="tweetPhoto"] img')].map(i=>i.currentSrc||i.src), outgoingLinks:[...article.querySelectorAll('[data-testid="tweetText"] a')].map(a=>a.href).filter(h=>/^https?:/.test(h)) });
        }
      } else {
        for(const link of document.querySelectorAll('main a[href], article a[href]')) {
          const url=canonical(link.href); if(!url)continue;
          add(url,{caption:'',mediaUrls:[...link.querySelectorAll('img')].map(i=>i.currentSrc||i.src)});
        }
        if(isPost) {
          const article=document.querySelector('article')||document.querySelector('main');
          if(article) add(canonical(location.href),{caption:article.querySelector('h1')?.innerText||'',authorName:article.querySelector('header a')?.textContent||'',publishedAt:article.querySelector('time')?.dateTime||'',mediaUrls:[...article.querySelectorAll('img')].filter(i=>i.naturalWidth>200).map(i=>i.currentSrc||i.src)});
        }
      }
      const after=Object.keys(items).length; idle=after===before?idle+1:0;
      message=`${after} publicaciones conservadas. Leyendo la página…`;
      if(!await persist())return;
      if(isPost){message='Publicación visible capturada. Importá el JSON para completar su contenido.';break;}
      if(idle>=10){message='No aparecieron publicaciones nuevas durante 25 segundos. Captura pausada; verificá la página y reanudá si carga más. Esto no certifica un archivo completo.';break;}
      window.scrollBy({top:Math.max(500,window.innerHeight*0.85),behavior:'instant'});
      await delay(2500);
    }
    await persist();
  })().catch(async e=>{const s=(await chrome.storage.local.get(key))[key];if(s)await chrome.storage.local.set({[key]:{...s,message:`Error: ${e.message}. Checkpoint conservado.`}});}).finally(()=>{globalThis.__atlasRunning=false;});
})();
