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
  const url = new URL(tab.url || 'https://invalid.local');
  const host = url.hostname.replace(/^www\./, '');
  const platform = ['x.com', 'twitter.com'].includes(host)
    ? 'x'
    : host === 'instagram.com'
    ? 'instagram'
    : host === 'github.com'
    ? 'github'
    : null;
  if (!platform) throw Error('Abrí GitHub, X o Instagram en la pestaña activa.');
  return { tab, platform, key: `atlas-capture-${platform}`, url: tab.url };
}

async function show() {
  try {
    const { key, platform, url } = await tabInfo();
    if (platform === 'github') {
      status.textContent = `Pestaña GitHub detectada:\n${url}\nUsá el botón superior para guardarlo en 1 clic.`;
      return;
    }
    const s = (await chrome.storage.local.get(key))[key];
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
        status.textContent = e.message;
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

action('#start', async () => {
  const { tab, platform } = await tabInfo();
  if (platform === 'github') {
    throw Error('Para GitHub usá el botón "⚡ Guardar este Repositorio GitHub en Atlas".');
  }
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
  if (!s || !Object.keys(s.items || {}).length) throw Error('Todavía no hay publicaciones capturadas.');
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
  if (!s || !Object.keys(s.items || {}).length) throw Error('Todavía no hay publicaciones capturadas.');
  const blob = new Blob(
    [
      JSON.stringify(
        { version: 1, capturedAt: s.at, completeness: 'visible-content-only', items: Object.values(s.items) },
        null,
        2
      )
    ],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `atlas-${platform}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
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
