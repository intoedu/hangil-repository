// 공통: 회사 코드 확인, GitHub 이슈 API
// 환경변수
//   GITHUB_TOKEN  : 요청 저장소(REQUEST_REPO)의 Issues 읽기/쓰기 권한 토큰
//   REQUEST_REPO  : 요청을 쌓을 비공개 저장소 (예: intoedu/hangil-requests)
//   COMPANIES     : [{"code":"GP-XXXX","name":"그린파스처","repo":"intoedu/greenpasture","site":"https://..."}]
//   ADMIN_CODE    : 관리자 코드

export const STATUS_LABELS = ["상태:접수", "상태:작업중", "상태:검토대기", "상태:고객확인", "상태:보류"];

export function companies() {
  try { return JSON.parse(process.env.COMPANIES || "[]"); } catch { return []; }
}

const norm = c => String(c || "").trim().toUpperCase().replace(/\s+/g, "");

export function findByCode(code) {
  const c = norm(code);
  if (!c) return null;
  if (process.env.ADMIN_CODE && c === norm(process.env.ADMIN_CODE)) return { admin: true, name: "관리자" };
  return companies().find(x => norm(x.code) === c) || null;
}

export function ready() {
  return Boolean(process.env.GITHUB_TOKEN && process.env.REQUEST_REPO);
}

export async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "hangil-request-portal",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status}: ${data?.message || text}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const companyLabel = name => `회사:${name}`;

export function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

export function send(res, status, obj) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(obj);
}

// 코드 대입 공격을 늦추기 위한 지연
export const slow = () => new Promise(r => setTimeout(r, 700));

const META_RE = /<!--\s*hangil-request\s*([\s\S]*?)\s*-->/;
export function parseMeta(body) {
  const m = META_RE.exec(body || "");
  if (!m) return null;
  try { return JSON.parse(Buffer.from(m[1], "base64").toString("utf8")); } catch { return null; }
}
export function metaComment(obj) {
  return `<!-- hangil-request ${Buffer.from(JSON.stringify(obj), "utf8").toString("base64")} -->`;
}

export function statusOf(issue) {
  if (issue.state === "closed") return issue.state_reason === "not_planned" ? "취소" : "완료";
  const names = (issue.labels || []).map(l => (typeof l === "string" ? l : l.name));
  const map = { "상태:작업중": "작업중", "상태:검토대기": "작업중", "상태:고객확인": "고객확인 필요", "상태:보류": "보류" };
  for (const k of ["상태:고객확인", "상태:보류", "상태:검토대기", "상태:작업중"]) if (names.includes(k)) return map[k];
  return "접수";
}
