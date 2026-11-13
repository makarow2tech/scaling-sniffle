'use strict';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toB64(bytes) {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

function fromB64(value) {
  return Uint8Array.from(atob(value), function (c) { return c.charCodeAt(0); });
}

async function newKey() {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  return { raw: raw, key: key };
}

async function encryptText(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encoder.encode(text));
  return { ciphertext: toB64(cipher), iv: toB64(iv) };
}

async function decryptText(ciphertext, iv, key) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ciphertext));
  return decoder.decode(plain);
}

async function resolveKey(envelope) {
  const parsed = JSON.parse(envelope);
  if (parsed.mode !== 'public') return null;
  return crypto.subtle.importKey('raw', fromB64(parsed.k), { name: 'AES-GCM' }, true, ['decrypt', 'encrypt']);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

async function loadFeed() {
  const response = await fetch('/api/posts');
  const data = await response.json();
  const feed = document.getElementById('feed');
  feed.innerHTML = '';
  if (!data.posts.length) {
    feed.appendChild(el('p', 'empty', 'Henüz gönderi yok.'));
    return;
  }
  for (const post of data.posts) {
    const card = el('article', 'card');
    const meta = el('div', 'meta', post.visibility + ' · ' + post.author_label);
    const title = el('h3', '', post.title);
    const body = el('p', 'body');
    try {
      const key = await resolveKey(post.envelope);
      body.textContent = key ? await decryptText(post.ciphertext, post.iv, key) : '[özel içerik — anahtar gerekli]';
    } catch (error) {
      body.textContent = '[çözülemedi]';
    }
    card.appendChild(meta);
    card.appendChild(title);
    card.appendChild(body);
    feed.appendChild(card);
  }
}

async function publish() {
  const title = document.getElementById('title').value.trim();
  const body = document.getElementById('body').value.trim();
  const anonymous = document.getElementById('anon').checked;
  const status = document.getElementById('status');
  if (!title || !body) {
    status.textContent = 'Başlık ve gövde zorunlu.';
    return;
  }
  status.textContent = 'Şifreleniyor…';
  const generated = await newKey();
  const encrypted = await encryptText(body, generated.key);
  const envelope = { v: 1, mode: 'public', k: toB64(generated.raw) };
  const alias = 'gölge-' + Math.random().toString(16).slice(2, 6);

  await fetch('/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: title,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      envelope: JSON.stringify(envelope),
      visibility: 'public',
      community_slug: 'genel',
      author_label: anonymous ? 'anonim: ' + alias : 'kullanıcı',
    }),
  });

  document.getElementById('title').value = '';
  document.getElementById('body').value = '';
  status.textContent = 'Yayınlandı.';
  loadFeed();
}

document.getElementById('publish').addEventListener('click', publish);
loadFeed();
