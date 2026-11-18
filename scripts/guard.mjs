// Claude 가 바꾼 내용이 허용 범위 안인지 확인한다.
// 사용: node guard.mjs  (대상 저장소 폴더에서 실행, 환경변수 DENY, MAX_LINES)
import { execSync } from "node:child_process";

const deny = (process.env.DENY || "").split("\n").map(s => s.trim()).filter(Boolean);
const max = Number(process.env.MAX_LINES || 300);
const sh = c => execSync(c, { encoding: "utf8" }).trim();

sh("git add -A");
const files = sh("git diff --cached --name-only").split("\n").filter(Boolean);
if (!files.length) { console.log("NOCHANGE"); process.exit(3); }

const bad = files.filter(f => deny.some(d => (d.endsWith("/") ? f.startsWith(d) : f === d)));
if (bad.length) { console.error("허용되지 않은 파일 변경: " + bad.join(", ")); process.exit(2); }

let lines = 0;
for (const row of sh("git diff --cached --numstat").split("\n").filter(Boolean)) {
  const [a, d] = row.split("\t");
  lines += (a === "-" ? 0 : Number(a)) + (d === "-" ? 0 : Number(d));
}
if (lines > max) { console.error(`변경이 너무 큽니다: ${lines}줄 (한도 ${max}줄)`); process.exit(2); }
console.log(`OK ${files.length}개 파일, ${lines}줄`);
