const status = document.querySelector('#status');
const ENDPOINTS = ['http://localhost:3000', 'http://localhost:3070'];

async function postToAtlas(path, payload) {
  let lastErr = null;
  for (const base of ENDPOINTS) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) return data;
      lastErr = new Error(data.error || `Error HTTP ${res.status} en ${base}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('No se pudo conectar con Atlas en localhost:3000 ni localhost:3070');
}

async function tabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab?.url || 'https://invalid.local');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const platform = ['x.com', 'twitter.com'].includes(host)
    ? 'x'
    : host === 'instagram.com'
    ? 'instagram'
    : host === 'github.com'
    ? 'github'
    : host === 'web.whatsapp.com'
    ? 'whatsapp'
    : host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be'
    ? 'youtube'
    : /^https?:$/.test(url.protocol)
    ? 'web'
    : null;
  if (!platform) {
    throw Error('Abrí una pestaña web válida (GitHub, YouTube, WhatsApp Web, X o Instagram).');
  }
  return { tab, platform, key: `atlas-capture-${platform}`, url: tab.url };
}

async function runInActiveTab(fnName) {
  const { tab } = await tabInfo();
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: name => {
      const fn = globalThis[name];
      if (typeof fn !== 'function') {
        throw new Error(`Función ${name} no disponible en la pestaña.`);
      }
      const res = fn(globalThis.document, globalThis.location);
      if (Array.isArray(res)) {
        return {
          items: [...res],
          count: res.length,
          lines: res.lines || [],
          formattedText: res.formattedText || '',
          text: res.text || '',
          urls: res.urls || [],
          fullNames: res.fullNames || []
        };
      }
      return res;
    },
    args: [fnName]
  });
  return injection?.result;
}

function triggerDownload(content, filename, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function show() {
  try {
    const { key, platform, url } = await tabInfo();
    if (platform === 'github') {
      status.textContent = `Pestaña GitHub detectada:\n${url}\nPodés guardar el repo en 1 clic o escanear todos los repos de una Awesome List.`;
      return;
    }
    if (platform === 'youtube' || platform === 'web') {
      const cached = (await chrome.storage.local.get('atlas-page-repos'))['atlas-page-repos'];
      if (cached && cached.pageUrl === url) {
        status.textContent = `🔍 ${cached.count} repos GitHub detectados en esta página:\n${(cached.fullNames || []).slice(0, 6).join(', ')}${cached.count > 6 ? '…' : ''}`;
      } else {
        status.textContent = `Pestaña ${platform === 'youtube' ? 'YouTube' : 'Web'} activa:\nUsá "Escanear repos GitHub" o "Importar todos los repos en 1-Clic".`;
      }
      return;
    }
    const s = (await chrome.storage.local.get(key))[key];
    if (platform === 'whatsapp') {
      status.textContent = s
        ? `💬 WhatsApp Web: ${s.count || 0} mensajes con links\n${s.message || ''}`
        : 'WhatsApp Web activo. Tocá "Extraer mensajes con links" o "Enviar links a Atlas".';
      return;
    }
    status.textContent = s
      ? `${s.count || 0} publicaciones conservadas\n${s.message || ''}\nCheckpoint: ${s.at || ''}`
      : 'Sin checkpoint. Iniciá desde la página de guardados.';
  } catch (e) {
    status.textContent = e.message;
  }
}

const action = (id, fn) => {
  const el = document.querySelector(id);
  if (el) {
    el.addEventListener('click', async () => {
      try {
        await fn();
      } catch (e) {
        status.textContent = `❌ ${e.message}`;
      }
    });
  }
};

action('#save-github', async () => {
  const { url } = await tabInfo();
  status.textContent = `Analizando y guardando ${url} en Atlas...`;
  const data = await postToAtlas('/api/github/repos', {
    action: 'add-url',
    url
  });
  status.textContent = `✅ Guardado en Galería y Biblioteca:\n${data.repository?.fullName || url}\nTipo: ${data.repository?.resourceType || 'Repositorio'}`;
});

action('#scan-page-repos', async () => {
  const { url } = await tabInfo();
  status.textContent = 'Escaneando enlaces github.com/owner/repo en la página...';
  const res = await runInActiveTab('extractPageRepoList');
  const count = res?.count || 0;
  await chrome.storage.local.set({
    'atlas-page-repos': {
      pageUrl: url,
      count,
      fullNames: res?.fullNames || [],
      urls: res?.urls || [],
      text: res?.text || '',
      at: new Date().toISOString()
    }
  });
  if (count === 0) {
    status.textContent = 'No se encontraron enlaces a repositorios de GitHub en esta página.';
    return;
  }
  status.textContent = `🔍 ${count} repositorios únicos detectados:\n${(res.fullNames || []).slice(0, 10).join('\n')}${count > 10 ? `\n...y ${count - 10} más` : ''}`;
});

action('#import-page-repos', async () => {
  const { url } = await tabInfo();
  status.textContent = 'Extrayendo y enviando lista de repositorios a Atlas...';
  const res = await runInActiveTab('extractPageRepoList');
  const text = res?.text || '';
  if (!text.trim() && !/github\.com\//i.test(url)) {
    throw Error('No se detectaron repositorios de GitHub en esta página.');
  }
  const data = await postToAtlas('/api/github/repos', {
    action: 'import-repo-list',
    text,
    pageUrl: url,
    notes: `Importado con Extensión Atlas v3.0 desde ${url}`
  });
  status.textContent = `✅ Lista importada con deduplicación:\nDetectados: ${data.totalDetected || res?.count || 0}\nNuevos agregados: +${data.added}\nDuplicados omitidos: ${data.duplicatesSkipped}`;
});

action('#extract-whatsapp', async () => {
  const { key, platform } = await tabInfo();
  if (platform !== 'whatsapp') {
    throw Error('Abrí https://web.whatsapp.com y entrá a un chat para extraer mensajes.');
  }
  const res = await runInActiveTab('extractWhatsAppWeb');
  const itemsMap = {};
  for (const m of res?.items || []) {
    itemsMap[m.sourceUrl || m.formattedLine] = m;
  }
  await chrome.storage.local.set({
    [key]: {
      items: itemsMap,
      count: res?.count || 0,
      lines: res?.lines || [],
      formattedText: res?.formattedText || '',
      at: new Date().toISOString(),
      message: `${res?.count || 0} mensajes con links listos para importar o descargar.`
    }
  });
  if (!res?.count) {
    status.textContent = 'No se detectaron mensajes visibles con links en el chat activo.';
    return;
  }
  status.textContent = `💬 ${res.count} mensajes con links extraídos:\n${(res.lines || []).slice(0, 4).join('\n')}`;
});

action('#import-whatsapp', async () => {
  const { key, platform } = await tabInfo();
  let formattedText = '';
  if (platform === 'whatsapp') {
    const res = await runInActiveTab('extractWhatsAppWeb');
    formattedText = res?.formattedText || '';
    if (formattedText) {
      const itemsMap = {};
      for (const m of res?.items || []) {
        itemsMap[m.sourceUrl || m.formattedLine] = m;
      }
      await chrome.storage.local.set({
        [key]: {
          items: itemsMap,
          count: res?.count || 0,
          lines: res?.lines || [],
          formattedText,
          at: new Date().toISOString(),
          message: 'Sincronizando con Atlas...'
        }
      });
    }
  }
  if (!formattedText) {
    const saved = (await chrome.storage.local.get('atlas-capture-whatsapp'))['atlas-capture-whatsapp'];
    formattedText = saved?.formattedText || '';
  }
  if (!formattedText.trim()) {
    throw Error('No hay mensajes con links extraídos de WhatsApp Web.');
  }
  status.textContent = 'Enviando mensajes de WhatsApp Web a Atlas (localhost:3000)...';
  const data = await postToAtlas('/api/import', {
    action: 'import-whatsapp',
    text: formattedText,
    onlyWithLinks: true,
    filename: 'whatsapp-web-extension'
  });
  status.textContent = `✅ WhatsApp Web sincronizado con Atlas:\n+${data.added} nuevos | ${data.duplicates} duplicados (Total: ${data.total})`;
});

action('#download-whatsapp', async () => {
  let saved = (await chrome.storage.local.get('atlas-capture-whatsapp'))['atlas-capture-whatsapp'];
  const { platform } = await tabInfo();
  if ((!saved || !saved.formattedText) && platform === 'whatsapp') {
    const res = await runInActiveTab('extractWhatsAppWeb');
    if (res?.count) {
      saved = {
        items: res.items,
        count: res.count,
        lines: res.lines,
        formattedText: res.formattedText,
        at: new Date().toISOString()
      };
    }
  }
  if (!saved || !saved.formattedText) {
    throw Error('Primero extraé mensajes con links desde WhatsApp Web.');
  }
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(saved.formattedText, `atlas-whatsapp-${stamp}.txt`, 'text/plain;charset=utf-8');
  triggerDownload(
    JSON.stringify(
      {
        version: 3,
        platform: 'whatsapp',
        capturedAt: saved.at || new Date().toISOString(),
        formattedText: saved.formattedText,
        lines: saved.lines || [],
        items: Object.values(saved.items || {})
      },
      null,
      2
    ),
    `atlas-whatsapp-${stamp}.json`,
    'application/json'
  );
  status.textContent = `📄 Descargados atlas-whatsapp-${stamp}.txt y .json (${saved.count || 0} mensajes).`;
});

action('#start', async () => {
  const { tab, platform } = await tabInfo();
  if (platform === 'github') {
    throw Error('Para GitHub usá los botones superiores de 1-Clic.');
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      globalThis.__atlasForceStart = true;
      globalThis.__atlasScrollLoop = true;
    }
  });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture.js'] });
  await show();
});

action('#stop', async () => {
  const { key } = await tabInfo();
  await chrome.storage.local.set({ [`${key}-stop`]: true });
  await show();
});

action('#sync', async () => {
  const { key, platform } = await tabInfo();
  const s = (await chrome.storage.local.get(key))[key];
  if (!s || !Object.keys(s.items || {}).length) {
    throw Error('Todavía no hay publicaciones capturadas.');
  }
  if (platform === 'whatsapp' && s.formattedText) {
    const data = await postToAtlas('/api/import', {
      action: 'import-whatsapp',
      text: s.formattedText,
      onlyWithLinks: true,
      filename: 'whatsapp-web-extension'
    });
    await chrome.storage.local.set({
      [key]: {
        ...s,
        message: `Sincronizado con Atlas: +${data.added} nuevos, ${data.duplicates} dup (Total: ${data.total})`
      }
    });
    await show();
    return;
  }
  const data = await postToAtlas('/api/bookmarks', {
    items: Object.values(s.items),
    filename: `extension-${platform}`,
    kind: 'browser_extension'
  });
  await chrome.storage.local.set({
    [key]: {
      ...s,
      message: `Sincronizado con Atlas: +${data.added} nuevos, ${data.duplicates} dup (Total: ${data.total})`
    }
  });
  await show();
});

action('#download', async () => {
  const { key, platform } = await tabInfo();
  const s = (await chrome.storage.local.get(key))[key];
  if (!s || !Object.keys(s.items || {}).length) {
    throw Error('Todavía no hay publicaciones capturadas.');
  }
  const content = JSON.stringify(
    {
      version: 3,
      platform,
      capturedAt: s.at,
      completeness: 'visible-content-only',
      ...(s.formattedText ? { formattedText: s.formattedText } : {}),
      items: Object.values(s.items)
    },
    null,
    2
  );
  triggerDownload(content, `atlas-${platform}-${new Date().toISOString().slice(0, 10)}.json`);
});

action('#reset', async () => {
  const { key } = await tabInfo();
  if (!confirm('Descargá primero el JSON. ¿Borrar el checkpoint local de esta plataforma?')) return;
  await chrome.storage.local.set({ [`${key}-stop`]: true, [`${key}-reset`]: Date.now() });
  await chrome.storage.local.remove(key);
  await show();
});

show();
setInterval(show, 2500);
