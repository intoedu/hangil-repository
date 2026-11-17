import { findByCode, ready, send, readBody, slow } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false });
  const { code } = readBody(req);
  const c = findByCode(code);
  if (!c) { await slow(); return send(res, 401, { ok: false, error: "코드가 맞지 않습니다. 한길마케팅에서 받은 코드를 다시 확인해 주세요." }); }
  return send(res, 200, { ok: true, admin: !!c.admin, name: c.name, site: c.site || "", ready: ready() });
}
