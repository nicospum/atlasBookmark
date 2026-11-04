const status = document.querySelector('#status');
async function tabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab.url || 'https://invalid.local');
  const host = url.hostname.replace(/^www\./, '');
  const platform = ['x.com', 'twitter.com'].includes(host) ? 'x' : host === 'instagram.com' ? 'instagram' : null;
  if (!platform) throw Error('Abrí X o Instagram en la pestaña activa.');
  return { tab, platform, key: `atlas-capture-${platform}` };
}
async function show() {
  try { const { key } = await tabInfo(); const s = (await chrome.storage.local.get(key))[key];
    status.textContent = s ? `${s.count || 0} publicaciones conservadas\n${s.message || ''}\nCheckpoint: ${s.at || ''}` : 'Sin checkpoint. Iniciá desde la página de guardados.';
  } catch (e) { status.textContent = e.message; }
}
const action = (id, fn) => {
  const el = document.querySelector(id);
  if (el) el.addEventListener('click', async () => { try { await fn(); await show(); } catch(e) { status.textContent = e.message; } });
};
action('#start', async () => { const { tab } = await tabInfo(); await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture.js'] }); });
action('#stop', async () => { const { key } = await tabInfo(); await chrome.storage.local.set({ [`${key}-stop`]: true }); });
action('#sync', async () => {
  const { key, platform } = await tabInfo();
  const s = (await chrome.storage.local.get(key))[key];
  if (!s || !Object.keys(s.items || {}).length) throw Error('Todavía no hay publicaciones capturadas.');
  const res = await fetch('http://localhost:3070/api/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: Object.values(s.items),
      filename: `extension-${platform}`,
      kind: 'browser_extension'
    })
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw Error(data.error || 'No se pudo conectar con localhost:3070');
  await chrome.storage.local.set({
    [key]: { ...s, message: `Sincronizado con Atlas: +${data.added} nuevos, ${data.duplicates} dup (Total: ${data.total})` }
  });
});
action('#download', async () => { const { key, platform } = await tabInfo(); const s = (await chrome.storage.local.get(key))[key];
  if (!s || !Object.keys(s.items || {}).length) throw Error('Todavía no hay publicaciones capturadas.');
  const blob = new Blob([JSON.stringify({ version: 1, capturedAt: s.at, completeness: 'visible-content-only', items: Object.values(s.items) }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `atlas-${platform}-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),30000);
});
action('#reset', async () => { const { key } = await tabInfo(); if (!confirm('Descargá primero el JSON. ¿Borrar el checkpoint local de esta plataforma?')) return; await chrome.storage.local.set({ [`${key}-stop`]: true, [`${key}-reset`]: Date.now() }); await chrome.storage.local.remove(key); });
show(); setInterval(show, 1500);
