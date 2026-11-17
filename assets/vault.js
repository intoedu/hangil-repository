// 회사 키로 GitHub 열쇠(토큰)를 잠그고 푸는 도구
// PBKDF2-SHA256(600,000회) → AES-GCM 256
// 키 형식: <회사ID>-XXXX-XXXX-XXXX-XXXX  (예: GM-7K3Q-9M2D-...)
const Vault = (() => {
  const ITER = 600000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O, 1/I 제외

  async function derive(key, salt, iter) {
    const base = await crypto.subtle.importKey("raw", enc.encode(normalize(key)), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  function normalize(key) { return String(key || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function companyId(key) { const m = String(key || "").trim().toUpperCase().match(/^([A-Z]{2,6})[-\s]/); return m ? m[1] : null; }
  function newKey(id) {
    const r = crypto.getRandomValues(new Uint8Array(16));
    let s = "";
    for (let i = 0; i < 16; i++) { s += ALPHA[r[i] % ALPHA.length]; if (i % 4 === 3 && i < 15) s += "-"; }
    return `${id}-${s}`;
  }
  async function lock(key, payload) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const k = await derive(key, salt, ITER);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(JSON.stringify(payload)));
    return { iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  async function unlock(key, box) {
    const k = await derive(key, unb64(box.salt), box.iter || ITER);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, k, unb64(box.ct));
    return JSON.parse(dec.decode(pt));
  }
  return { lock, unlock, newKey, companyId };
})();
