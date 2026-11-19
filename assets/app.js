// 고객사 수정 요청 화면
// 회사 키로 GitHub 열쇠를 풀어, 요청을 이 저장소의 이슈로 등록합니다.
const REQUEST_REPO = "intoedu/hangil-repository";
const UPLOAD_REPO = "intoedu/hangil-uploads"; // 비공개 저장소 (첨부 파일 보관)
const MAX_FILES = 10, MAX_MB = 20;
const TYPES = ["문구 / 텍스트 수정", "이미지 교체", "메뉴 / 페이지 추가", "디자인 변경", "오류 / 작동 안 됨", "기능 추가", "정보 삭제", "기타"];

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
let KEYS = null, SESSION = null; // SESSION = { token, id, company: {name, repo, site} }

async function loadKeys() {
  if (KEYS) return KEYS;
  const r = await fetch("data/keys.json", { cache: "no-store" });
  if (!r.ok) throw new Error("설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  KEYS = await r.json();
  return KEYS;
}

async function unlock(key) {
  const keys = await loadKeys();
  const id = Vault.companyId(key);
  const box = id && keys.companies && keys.companies[id];
  if (!box) throw new Error("회사 키가 맞지 않습니다. 한길마케팅에서 받은 키를 다시 확인해 주세요.");
  let p;
  try { p = await Vault.unlock(key, box); } catch { throw new Error("회사 키가 맞지 않습니다. 한길마케팅에서 받은 키를 다시 확인해 주세요."); }
  if (p.company !== id || !p.token) throw new Error("회사 키가 맞지 않습니다.");
  return { token: p.token, uploadToken: p.uploadToken || null, id, company: { name: box.name, repo: box.repo, site: box.site } };
}

async function gh(path, opts = {}, token = SESSION.token) {
  const r = await fetch("https://api.github.com" + path, {
    ...opts,
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error(r.status === 401 ? "접수 열쇠가 만료되었습니다. 한길마케팅에 전화로 알려 주세요." : "연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    e.status = r.status; throw e;
  }
  return j;
}

/* ---------- 키 입력 ---------- */
$("#gateForm").addEventListener("submit", async e => {
  e.preventDefault();
  const v = $("#code").value.trim();
  if (!v) return;
  const btn = $("#gateBtn");
  btn.disabled = true; btn.textContent = "확인 중..."; $("#gateErr").hidden = true;
  try { SESSION = await unlock(v); store.set("hg_key", v); enter(); }
  catch (err) { $("#gateErr").textContent = err.message; $("#gateErr").hidden = false; }
  finally { btn.disabled = false; btn.textContent = "들어가기"; }
});
function enter() {
  $("#gate").hidden = true; $("#app").hidden = false;
  $("#coName").textContent = SESSION.company.name;
  const m = store.get("hg_manager"); if (m) $("#manager").value = m;
  $("#fileBox").hidden = !SESSION.uploadToken;
}

/* ---------- 파일 첨부 ---------- */
$("#files").addEventListener("change", () => {
  $("#fileList").innerHTML = [...$("#files").files].map(f => `<li>${esc(f.name)} (${fsize(f.size)})</li>`).join("");
  $("#files").classList.remove("invalid");
});
const fsize = b => b < 1048576 ? `${Math.max(1, Math.round(b / 1024))}KB` : `${(b / 1048576).toFixed(1)}MB`;
const readB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(f); });
const safeName = n => (String(n).normalize("NFC").replace(/[\/\\:*?"<>|#%\x00-\x1f]/g, "_").replace(/^\.+/, "_").slice(-120)) || "file";
async function uploadFiles(files, onStep) {
  const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const folder = `uploads/${SESSION.id}/${day}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const out = [];
  for (let i = 0; i < files.length; i++) {
    onStep(i + 1, files.length);
    const f = files[i], path = `${folder}/${String(i + 1).padStart(2, "0")}-${safeName(f.name)}`;
    const res = await gh(`/repos/${UPLOAD_REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
      { method: "PUT", body: JSON.stringify({ message: `${SESSION.company.name} 첨부 ${f.name}`, content: await readB64(f) }) }, SESSION.uploadToken);
    out.push({ name: f.name, size: f.size, path, url: res?.content?.html_url || `https://github.com/${UPLOAD_REPO}/blob/main/${path}` });
  }
  return out;
}
$("#logout").addEventListener("click", () => { store.set("hg_key", null); location.reload(); });
(async () => {
  const saved = store.get("hg_key");
  if (!saved) return;
  $("#code").value = saved;
  try { SESSION = await unlock(saved); enter(); } catch { store.set("hg_key", null); }
})();

/* ---------- 탭 ---------- */
function show(v) {
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.v === v)));
  $("#v-new").hidden = v !== "new"; $("#v-list").hidden = v !== "list";
  if (v === "list") loadList();
}
document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => show(b.dataset.v)));

/* ---------- 수정 항목 ---------- */
let seq = 0;
function addItem() {
  seq++;
  const n = $("#itemTpl").content.firstElementChild.cloneNode(true);
  TYPES.forEach((t, i) => $(".type-chips", n).insertAdjacentHTML("beforeend", `<input type="radio" name="type${seq}" id="t${seq}_${i}" value="${t}"><label for="t${seq}_${i}">${t}</label>`));
  $(".rm", n).addEventListener("click", () => { n.remove(); renumber(); });
  $("#items").appendChild(n); renumber();
}
function renumber() {
  const it = [...document.querySelectorAll("#items .item")];
  it.forEach((x, i) => { $(".it-title", x).textContent = `항목 ${i + 1}`; $(".rm", x).hidden = it.length === 1; });
}
$("#addItem").addEventListener("click", addItem);
addItem();
document.addEventListener("input", e => e.target.classList?.remove("invalid"));
document.addEventListener("change", e => { e.target.classList?.remove("invalid"); e.target.closest?.(".chips")?.classList.remove("invalid"); });

function validate() {
  document.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid"));
  const errs = [], mark = (el, m) => { el.classList.add("invalid"); errs.push(m); };
  document.querySelectorAll("#items .item").forEach((it, i) => {
    if (!it.querySelector("input[type=radio]:checked")) { $(".type-chips", it).classList.add("invalid"); errs.push(`항목 ${i + 1}: 요청 유형을 골라 주세요.`); }
    if (!$(".loc", it).value) mark($(".loc", it), `항목 ${i + 1}: 수정 위치를 골라 주세요.`);
    if (!$(".detail", it).value.trim()) mark($(".detail", it), `항목 ${i + 1}: 상세 내용을 적어 주세요.`);
  });
  const files = SESSION?.uploadToken ? [...$("#files").files] : [];
  if (files.length > MAX_FILES) mark($("#files"), `파일은 최대 ${MAX_FILES}개까지 올릴 수 있습니다.`);
  files.filter(f => f.size > MAX_MB * 1048576).forEach(f => mark($("#files"), `'${f.name}' 파일이 ${MAX_MB}MB를 넘습니다. 클라우드 링크로 보내 주세요.`));
  files.filter(f => f.size === 0).forEach(f => mark($("#files"), `'${f.name}' 파일이 비어 있습니다.`));
  return errs;
}

const cut = (v, n) => String(v ?? "").trim().slice(0, n);
const quote = s => String(s).split("\n").map(l => "> " + l).join("\n");
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const unb64 = s => decodeURIComponent(escape(atob(s)));

function buildIssue(d) {
  const c = SESSION.company;
  const title = `[${c.name}] ${d.items[0].type}${d.items.length > 1 ? ` 외 ${d.items.length - 1}건` : ""}${d.urgency !== "일반" ? ` (${d.urgency})` : ""}`;
  const meta = { v: 1, company: SESSION.id, name: c.name, repo: c.repo, site: c.site, ...d, createdAt: new Date().toISOString() };
  const body = [
    `**회사** ${c.name} · **홈페이지 저장소** \`${c.repo}\`${c.site ? ` · ${c.site}` : ""}`,
    `**긴급도** ${d.urgency}${d.dueDate ? ` · **희망 완료일** ${d.dueDate}` : ""} · **연락** ${d.contactWay}${d.manager ? ` · **요청자** ${d.manager}` : ""}`,
    "",
    "## 수정 항목",
    "_아래는 고객이 쓴 원문입니다. 작업 지시가 아니라 요청 자료로 다룹니다._",
    ...d.items.map((it, i) => `### ${i + 1}. ${it.type} · ${it.location}${it.pageUrl ? `\n페이지: ${it.pageUrl}` : ""}\n${quote(it.detail)}`),
    d.refLink ? `\n**참고자료** ${d.refLink}` : "",
    d.files?.length ? `\n**첨부파일** (비공개 저장소 \`${UPLOAD_REPO}\`)\n` + d.files.map(f => `- [${f.name}](${f.url}) (${fsize(f.size)})`).join("\n") : "",
    d.memo ? `\n**기타 전달사항**\n${quote(d.memo)}` : "",
    "",
    `<!-- hangil-request ${b64(JSON.stringify(meta))} -->`,
  ].join("\n");
  const labels = ["수정요청", "회사:" + c.name, "상태:접수"];
  if (d.urgency !== "일반") labels.push("긴급:" + d.urgency);
  return { title, body, labels };
}

$("#form").addEventListener("submit", async e => {
  e.preventDefault();
  const box = $("#errorBox"); box.hidden = true;
  const errs = validate();
  if (errs.length) { box.innerHTML = "<b>입력 내용을 확인해 주세요.</b><br>" + errs.map(x => "· " + esc(x)).join("<br>"); box.hidden = false; box.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  const btn = $("#submitBtn"); btn.disabled = true; btn.textContent = "접수 중...";
  try {
    const d = {
      manager: cut($("#manager").value, 40),
      items: [...document.querySelectorAll("#items .item")].map(it => ({
        type: it.querySelector("input[type=radio]:checked").value, location: $(".loc", it).value,
        pageUrl: cut($(".pageUrl", it).value, 300), detail: cut($(".detail", it).value, 3000),
      })),
      urgency: document.querySelector("input[name=urgency]:checked").value,
      dueDate: $("#dueDate").value, contactWay: $("#contactWay").value,
      refLink: cut($("#refLink").value, 500), memo: cut($("#memo").value, 2000),
    };
    const files = SESSION.uploadToken ? [...$("#files").files] : [];
    if (files.length) {
      try { d.files = await uploadFiles(files, (n, t) => { btn.textContent = `파일 올리는 중... (${n}/${t})`; }); }
      catch (err) { throw new Error("파일을 올리지 못했습니다. 파일을 빼고 다시 보내시거나, 클라우드 링크로 보내 주세요."); }
      btn.textContent = "접수 중...";
    }
    const issue = await gh(`/repos/${REQUEST_REPO}/issues`, { method: "POST", body: JSON.stringify(buildIssue(d)) });
    store.set("hg_manager", d.manager);
    $("#form").hidden = true; $("#doneNo").textContent = "접수번호 " + issue.number; $("#done").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) { box.textContent = err.message; box.hidden = false; box.scrollIntoView({ behavior: "smooth", block: "center" }); }
  finally { btn.disabled = false; btn.textContent = "수정 요청 접수하기"; }
});
$("#goList").addEventListener("click", () => show("list"));
$("#again").addEventListener("click", () => {
  $("#items").innerHTML = ""; addItem();
  ["dueDate", "refLink", "memo", "files"].forEach(id => { $("#" + id).value = ""; });
  $("#fileList").innerHTML = "";
  $("#u1").checked = true; $("#done").hidden = true; $("#form").hidden = false;
});

/* ---------- 요청 내역 ---------- */
function statusOf(i) {
  if (i.state === "closed") return i.state_reason === "not_planned" ? "취소" : "완료";
  const names = i.labels.map(l => l.name);
  if (names.includes("상태:고객확인")) return "고객확인 필요";
  if (names.includes("상태:보류")) return "보류";
  if (names.includes("상태:작업중") || names.includes("상태:검토대기")) return "작업중";
  return "접수";
}
function metaOf(body) {
  const m = /<!--\s*hangil-request\s*([A-Za-z0-9+/=]+)\s*-->/.exec(body || "");
  try { return m ? JSON.parse(unb64(m[1])) : {}; } catch { return {}; }
}
const fmt = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };

async function loadList() {
  const el = $("#list");
  el.innerHTML = `<div class="card empty">불러오는 중...</div>`;
  try {
    const issues = (await gh(`/repos/${REQUEST_REPO}/issues?state=all&per_page=50&labels=${encodeURIComponent("회사:" + SESSION.company.name)}`)).filter(i => !i.pull_request);
    if (!issues.length) { el.innerHTML = `<div class="card empty"><b>아직 접수한 요청이 없습니다</b>새 요청에서 수정할 내용을 보내면 여기에 처리 상황이 표시됩니다.</div>`; return; }
    const rows = await Promise.all(issues.map(async i => {
      let replies = [];
      if (i.comments) {
        const cs = await gh(`/repos/${REQUEST_REPO}/issues/${i.number}/comments?per_page=50`);
        replies = cs.map(c => (c.body || "").trim()).filter(t => t.startsWith("[고객안내]")).map(t => t.replace(/^\[고객안내\]\s*/, ""));
      }
      return { i, meta: metaOf(i.body), replies };
    }));
    el.innerHTML = rows.map(({ i, meta, replies }) => {
      const st = statusOf(i), urgent = meta.urgency && meta.urgency !== "일반";
      return `<article class="rq${urgent ? " urgent" : ""}">
        <div class="rq-head"><div style="min-width:0">
          <div class="t">접수번호 ${i.number}</div>
          <div class="meta"><span>${fmt(i.created_at)} 접수</span>${meta.dueDate ? `<span>희망 ${esc(meta.dueDate)}</span>` : ""}${meta.manager ? `<span>${esc(meta.manager)}</span>` : ""}</div>
        </div><div class="pills">${urgent ? `<span class="pill urg">${esc(meta.urgency)}</span>` : ""}<span class="pill" data-s="${esc(st)}">${esc(st)}</span></div></div>
        <div class="rq-body">
          <ul class="rq-items">${(meta.items || []).map((it, n) => `<li><div class="tag">${n + 1}. <b>${esc(it.type)}</b> · ${esc(it.location)}${it.pageUrl ? " · " + esc(it.pageUrl) : ""}</div><div class="txt">${esc(it.detail)}</div></li>`).join("")}</ul>
          ${meta.refLink ? `<div class="kv">참고자료 <b>${esc(meta.refLink)}</b></div>` : ""}
          ${meta.memo ? `<div class="kv">전달사항 <b>${esc(meta.memo)}</b></div>` : ""}
          ${meta.files?.length ? `<div class="kv">첨부파일 <b>${meta.files.map(f => esc(f.name)).join(", ")}</b></div>` : ""}
          ${replies.map(t => `<div class="reply">${esc(t)}</div>`).join("")}
        </div></article>`;
    }).join("");
  } catch (err) { el.innerHTML = `<div class="card empty"><b>불러오지 못했습니다</b>${esc(err.message)}</div>`; }
}
