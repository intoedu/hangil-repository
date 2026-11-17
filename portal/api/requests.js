import { findByCode, ready, gh, send, readBody, slow, companyLabel, parseMeta, statusOf } from "./_lib.js";

// 고객: 자기 회사 요청 + 담당자 안내([고객안내]로 시작하는 댓글)
// 관리자: 전체 요청 + GitHub 링크
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false });
  const c = findByCode(readBody(req).code);
  if (!c) { await slow(); return send(res, 401, { ok: false, error: "코드가 맞지 않습니다." }); }
  if (!ready()) return send(res, 200, { ok: true, ready: false, requests: [] });

  try {
    const [owner, repo] = process.env.REQUEST_REPO.split("/");
    const label = c.admin ? "수정요청" : companyLabel(c.name);
    const issues = await gh(`/repos/${owner}/${repo}/issues?state=all&per_page=50&labels=${encodeURIComponent(label)}`);
    const list = await Promise.all(issues.filter(i => !i.pull_request).map(async i => {
      const meta = parseMeta(i.body) || {};
      let replies = [];
      if (i.comments) {
        const cs = await gh(`/repos/${owner}/${repo}/issues/${i.number}/comments?per_page=50`);
        replies = cs.map(x => x.body || "").filter(t => t.trim().startsWith("[고객안내]"))
          .map(t => t.trim().replace(/^\[고객안내\]\s*/, ""));
      }
      const r = {
        no: i.number, title: i.title, status: statusOf(i), createdAt: i.created_at, updatedAt: i.updated_at,
        urgency: meta.urgency, dueDate: meta.dueDate, items: meta.items || [], refLink: meta.refLink, memo: meta.memo,
        replies,
      };
      if (c.admin) Object.assign(r, { company: meta.company, manager: meta.manager, phone: meta.phone, email: meta.email, url: i.html_url, repo: meta.repo });
      return r;
    }));
    return send(res, 200, { ok: true, ready: true, requests: list });
  } catch (e) {
    console.error(e);
    return send(res, 502, { ok: false, error: "목록을 불러오지 못했습니다." });
  }
}
