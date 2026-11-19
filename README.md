# 한길마케팅 홈페이지 수정 요청

고객사가 **회원가입 없이, 회사 키만으로** 홈페이지 수정을 요청하는 곳입니다. GitHub만 사용합니다.

```
고객: 요청 페이지 → 회사 키 입력 → 수정 항목 선택·작성 → 보내기
  → 이 저장소에 이슈로 등록
  → Claude Code가 해당 홈페이지 저장소에 수정안(PR) 작성
  → 한길마케팅 담당자가 확인 후 병합 → 홈페이지 반영 → 고객 화면에 '완료'
```

| 파일 | 내용 |
|---|---|
| `index.html`, `assets/app.js` | 고객용 요청 화면 (회사 키 입력 → 요청 작성 / 요청 내역) |
| `setup.html` | 담당자용: 회사별 키 만들기 (브라우저 안에서만 처리) |
| `assets/vault.js` | 회사 키로 GitHub 토큰을 잠그고 푸는 코드 (PBKDF2 60만 회 + AES-GCM) |
| `data/keys.json` | 회사별로 잠긴 토큰 (키 없이는 풀 수 없음) |
| `CLAUDE.md` | Claude Code가 요청을 처리하는 규칙 |

## 처음 설정 (담당자, 한 번)

1. **GitHub Pages 켜기**: 이 저장소 Settings → Pages → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save
2. **토큰 만들기**: GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
   - Repository access: **Only select repositories** → `intoedu/hangil-repository`
   - Repository permissions → **Issues: Read and write** (다른 권한은 주지 않음)
   - Expiration: 1년 (만료되면 다시 만들어 3번 반복)
   - 조직(intoedu) 저장소라 조직 승인이 필요하다고 나오면 조직 설정에서 승인합니다.
3. **회사 키 만들기**: `https://intoedu.github.io/hangil-repository/setup.html` 에서 토큰을 넣고 [키 만들기]
   - 표에 나온 **회사 키**를 고객사에 전달
   - 아래 칸의 내용을 `data/keys.json` 에 반영 (Claude에게 보내도 안전)

## 파일 첨부 켜기 (선택)
1. 비공개 저장소 `intoedu/hangil-uploads` 만들기 (Private, README 추가 체크)
2. 토큰 하나 더: 저장소 `hangil-uploads` 만, **Contents: Read and write** 만
3. `setup.html` 에서 회사 키 칸에 기존 키를 그대로 넣고, 두 토큰을 모두 넣어 [키 만들기] → 결과를 `data/keys.json` 에 반영 (고객 키는 그대로)

## 보안 메모
- 회사 키를 아는 사람은 그 회사 이름으로 요청을 보낼 수 있습니다. 그래도 **담당자가 병합하기 전에는 홈페이지가 바뀌지 않습니다.**
- 키가 새면 `setup.html` 에서 그 회사만 "키 새로 만들기"로 바꿉니다.
- 키를 아는 사람은 브라우저 개발자 도구로 토큰을 꺼낼 수 있습니다. 토큰 권한이 이 저장소 이슈뿐이라 홈페이지 코드는 건드릴 수 없습니다.
- 요청은 공개 저장소에 쌓이므로 **개인정보를 받지 않습니다.** (화면에 안내 문구 있음)
