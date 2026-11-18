// 이슈 본문의 요청 메타를 읽고 data/keys.json, data/sites.json 과 대조한다.
// 사용: node scripts/request-meta.mjs <hangil 저장소 경로>
// 결과를 GITHUB_OUTPUT 에 repo, branch, company, ok 로 쓴다.
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || ".";
const event = JSON.parse(fs.readFileSync(process.env.REQ_EVENT_PATH || process.env.GITHUB_EVENT_PATH, "utf8"));
const out = (k, v) => fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}<<__EOF__\n${v}\n__EOF__\n`);

function fail(reason) {
  console.log("처리하지 않음: " + reason);
  out("ok", "false");
  out("reason", reason);
  process.exit(0);
}

const body = event.issue?.body || "";
const m = /<!--\s*hangil-request\s*([A-Za-z0-9+/=]+)\s*-->/.exec(body);
if (!m) fail("요청 메타가 없습니다");
let meta;
try { meta = JSON.parse(Buffer.from(m[1], "base64").toString("utf8")); } catch { fail("요청 메타를 읽을 수 없습니다"); }

const keys = JSON.parse(fs.readFileSync(path.join(root, "data/keys.json"), "utf8"));
const sites = JSON.parse(fs.readFileSync(path.join(root, "data/sites.json"), "utf8"));
const company = keys.companies?.[meta.company];
if (!company) fail("등록되지 않은 회사입니다");
if (company.repo !== meta.repo) fail("회사와 저장소가 맞지 않습니다");
const site = sites[company.repo];
if (!site) fail("자동 반영이 설정되지 않은 저장소입니다");

out("ok", "true");
out("company", company.name);
out("repo", company.repo);
out("branch", site.branch);
out("install", site.install || "");
out("build", site.build || "");
out("max_lines", String(site.maxChangedLines || 300));
out("deny", (site.deny || []).join("\n"));
// Claude 에게 줄 요청 자료 (메타에서 다시 만든 깨끗한 텍스트)
const items = (meta.items || []).map((it, i) =>
  `${i + 1}. [${it.type}] 위치: ${it.location}${it.pageUrl ? ` (페이지: ${it.pageUrl})` : ""}\n   내용: ${String(it.detail || "").replace(/\n/g, "\n   ")}`).join("\n");
const brief = [
  `회사: ${company.name}`,
  `긴급도: ${meta.urgency || "일반"}`,
  items,
  meta.refLink ? `참고자료 링크: ${meta.refLink}` : "",
  meta.memo ? `기타 전달사항: ${meta.memo}` : "",
].filter(Boolean).join("\n");
fs.writeFileSync(path.join(process.env.RUNNER_TEMP, "request.txt"), brief);
console.log(brief);
