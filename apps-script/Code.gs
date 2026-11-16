/**
 * 한길마케팅 · 홈페이지 수정 요청 접수 (Google Apps Script)
 *
 * 하는 일
 *  1) index.html 폼에서 보낸 요청을 구글 시트 "접수목록"에 저장 (수정 항목 1건 = 1행)
 *  2) 첨부파일을 구글 드라이브 폴더에 저장하고 링크를 시트에 기록
 *  3) 새 접수가 들어오면 담당자 이메일로 알림 발송
 *
 * 설치 방법은 SETUP.md 참고.
 */

// ===== 설정 =====
const CONFIG = {
  SHEET_NAME: '접수목록',
  NOTIFY_EMAILS: '',            // 알림 받을 이메일 (여러 개면 쉼표로 구분). 비우면 알림 안 보냄
  DRIVE_FOLDER_NAME: '홈페이지 수정요청 첨부파일',
  RECEIPT_PREFIX: 'HG',
  STATUS_LIST: ['접수', '확인중', '작업중', '고객확인 필요', '완료', '보류'],
};

const HEADERS = [
  '접수번호', '접수일시', '회사명', '담당자', '연락처', '이메일', '홈페이지',
  '항목', '요청유형', '수정위치', '페이지주소', '상세내용',
  '긴급도', '희망완료일', '선호연락', '기타전달', '첨부파일',
  '처리상태', '작업담당', '처리메모', '완료일',
];

/** 최초 1회 실행: 시트 헤더, 처리상태 드롭다운, 서식 세팅 */
function setup() {
  const sheet = getSheet_();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#1f4fd8').setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  const statusCol = HEADERS.indexOf('처리상태') + 1;
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.STATUS_LIST, true).setAllowInvalid(false).build();
  sheet.getRange(2, statusCol, sheet.getMaxRows() - 1, 1).setDataValidation(rule);

  // 처리상태별 색상
  const range = sheet.getRange(2, statusCol, sheet.getMaxRows() - 1, 1);
  const colors = { '접수': '#fde2e2', '확인중': '#fff4d6', '작업중': '#dbe7ff', '고객확인 필요': '#efe0ff', '완료': '#d9f2e6', '보류': '#e5e7eb' };
  const rules = Object.keys(colors).map(s =>
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s).setBackground(colors[s]).setRanges([range]).build());
  sheet.setConditionalFormatRules(rules);

  // 긴급도 '매우 급함' 강조
  const urgCol = HEADERS.indexOf('긴급도') + 1;
  const urgRange = sheet.getRange(2, urgCol, sheet.getMaxRows() - 1, 1);
  sheet.setConditionalFormatRules(sheet.getConditionalFormatRules().concat([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('매우 급함').setBackground('#d93838').setFontColor('#ffffff').setRanges([urgRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('급함').setBackground('#ffd8a8').setRanges([urgRange]).build(),
  ]));

  sheet.setColumnWidth(HEADERS.indexOf('상세내용') + 1, 360);
  sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).setVerticalAlignment('top');
  sheet.getRange(2, HEADERS.indexOf('상세내용') + 1, sheet.getMaxRows() - 1, 1).setWrap(true);
}

/** 폼 제출 수신 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const d = JSON.parse(e.postData.contents);

    // 필수값 서버 검증
    if (!d.company || !d.manager || !d.phone || !d.site || !Array.isArray(d.items) || !d.items.length) {
      return json_({ ok: false, error: '필수 항목이 누락되었습니다.' });
    }

    const sheet = getSheet_();
    if (sheet.getLastRow() === 0) setup();

    const now = new Date();
    const receiptNo = nextReceiptNo_(sheet, now);
    const fileLinks = saveFiles_(d.files || [], receiptNo, d.company);

    const rows = d.items.map((it, i) => [
      receiptNo,
      now,
      safe_(d.company), safe_(d.manager), safe_(d.phone), safe_(d.email), safe_(d.site),
      `${i + 1}/${d.items.length}`,
      safe_(it.type), safe_(it.location), safe_(it.pageUrl), safe_(it.detail),
      safe_(d.urgency), safe_(d.dueDate), safe_(d.contactWay), safe_(d.memo),
      fileLinks.join('\n'),
      '접수', '', '', '',
    ]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);

    notify_(receiptNo, d, fileLinks);
    return json_({ ok: true, receiptNo: receiptNo });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/** 브라우저로 URL 열었을 때 동작 확인용 */
function doGet() {
  return json_({ ok: true, message: '수정 요청 접수 서버가 정상 작동 중입니다.' });
}

// ===== 내부 함수 =====
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);
}

/** HG-20261116-001 형식, 날짜별 일련번호 */
function nextReceiptNo_(sheet, now) {
  const ymd = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd');
  const prefix = `${CONFIG.RECEIPT_PREFIX}-${ymd}-`;
  let max = 0;
  const last = sheet.getLastRow();
  if (last > 1) {
    const ids = sheet.getRange(2, 1, last - 1, 1).getValues().flat();
    ids.forEach(id => {
      if (String(id).indexOf(prefix) === 0) max = Math.max(max, parseInt(String(id).slice(prefix.length), 10) || 0);
    });
  }
  return prefix + String(max + 1).padStart(3, '0');
}

function saveFiles_(files, receiptNo, company) {
  if (!files.length) return [];
  const root = getOrCreateFolder_(CONFIG.DRIVE_FOLDER_NAME, DriveApp.getRootFolder());
  const folder = root.createFolder(`${receiptNo}_${company}`);
  return files.slice(0, 5).map(f => {
    const blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.type, f.name);
    return folder.createFile(blob).getUrl();
  });
}

function getOrCreateFolder_(name, parent) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function notify_(receiptNo, d, fileLinks) {
  if (!CONFIG.NOTIFY_EMAILS) return;
  const urgentTag = d.urgency === '일반' ? '' : `[${d.urgency}] `;
  const subject = `${urgentTag}[수정요청] ${d.company} · ${d.items.length}건 (${receiptNo})`;
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const items = d.items.map((it, i) =>
    `<tr><td style="padding:6px;border:1px solid #ddd">${i + 1}</td>
     <td style="padding:6px;border:1px solid #ddd">${esc(it.type)}</td>
     <td style="padding:6px;border:1px solid #ddd">${esc(it.location)}${it.pageUrl ? '<br><small>' + esc(it.pageUrl) + '</small>' : ''}</td>
     <td style="padding:6px;border:1px solid #ddd;white-space:pre-wrap">${esc(it.detail)}</td></tr>`).join('');
  const html = `
    <h3>새 홈페이지 수정 요청 (${receiptNo})</h3>
    <p><b>${esc(d.company)}</b> · ${esc(d.manager)} · ${esc(d.phone)} ${d.email ? '· ' + esc(d.email) : ''}<br>
    홈페이지: ${esc(d.site)}<br>
    긴급도: <b>${esc(d.urgency)}</b> ${d.dueDate ? '· 희망완료일 ' + esc(d.dueDate) : ''} · 선호연락: ${esc(d.contactWay)}</p>
    <table style="border-collapse:collapse;font-size:14px">
      <tr style="background:#f3f4f6"><th style="padding:6px;border:1px solid #ddd">#</th><th style="padding:6px;border:1px solid #ddd">유형</th><th style="padding:6px;border:1px solid #ddd">위치</th><th style="padding:6px;border:1px solid #ddd">내용</th></tr>
      ${items}
    </table>
    ${d.memo ? '<p><b>기타 전달:</b><br>' + esc(d.memo).replace(/\n/g, '<br>') + '</p>' : ''}
    ${fileLinks.length ? '<p><b>첨부파일:</b><br>' + fileLinks.map(u => `<a href="${u}">${u}</a>`).join('<br>') + '</p>' : ''}
    <p><a href="${SpreadsheetApp.getActiveSpreadsheet().getUrl()}">접수 시트 열기</a></p>`;
  MailApp.sendEmail({ to: CONFIG.NOTIFY_EMAILS, subject: subject, htmlBody: html });
}

/** 시트 수식 주입 방지 (=, +, -, @ 로 시작하는 값 앞에 ' 추가) */
function safe_(v) {
  const s = String(v == null ? '' : v).slice(0, 5000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
