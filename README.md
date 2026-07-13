# StudyLoop

Todoist의 오늘 할 일을 바탕으로 Claude용 학습노트 프롬프트를 만들고, Claude 결과를 Notion 템플릿에 붙여넣기 쉬운 Markdown으로 정리하는 웹앱입니다. 정리된 Markdown은 복사해서 쓰거나, Notion API로 바로 저장할 수 있습니다.

## 배포 구조

Vercel 프로젝트 루트에 아래 파일과 폴더가 있어야 합니다.

```text
index.html
styles.css
app.js
README.md
api/
  auth-start.js
  auth-callback.js
  notion-auth-start.js
  notion-auth-callback.js
  notion-databases.js
  notion-push.js
```

## Todoist 앱 등록

Todoist 개발자 설정에서 앱을 만들고 아래 redirect URL을 등록합니다.

```text
https://study-loop-phi.vercel.app/api/auth-callback
```

앱을 만든 뒤 `Client ID`와 `Client Secret`을 Vercel 환경변수에 넣습니다.

```text
TODOIST_CLIENT_ID=Todoist에서 받은 Client ID
TODOIST_CLIENT_SECRET=Todoist에서 받은 Client Secret
APP_URL=https://study-loop-phi.vercel.app
```

## Notion 연동 설정 (OAuth)

Notion 저장도 Todoist와 동일하게 **로그인한 사용자 본인의 Notion 계정**에만 저장되는 OAuth 방식입니다. 서버에 고정된 계정 키가 없으므로, 배포 URL을 다른 사람과 공유해도 각자 자기 워크스페이스에만 저장됩니다.

1. [Notion Integrations](https://www.notion.so/my-integrations)에서 새 Integration을 만들 때 타입을 **Public**으로 선택합니다.
2. Integration 설정에서 `Redirect URIs`에 아래 URL을 등록합니다.

```text
https://study-loop-phi.vercel.app/api/notion-auth-callback
```

3. 발급된 `OAuth client ID`, `OAuth client secret`을 Vercel 환경변수에 넣습니다.

```text
NOTION_CLIENT_ID=Notion에서 받은 OAuth client ID
NOTION_CLIENT_SECRET=Notion에서 받은 OAuth client secret
```

`APP_URL`은 Todoist 연동에서 이미 설정한 값을 그대로 씁니다.

환경변수를 추가/변경한 뒤에는 Vercel에서 다시 배포해야 적용됩니다.

### 동작 방식

- `Notion으로 로그인`을 누르면 Notion 승인 화면에서 **로그인한 사람이 직접** 어떤 페이지/데이터베이스에 접근을 허용할지 고릅니다.
- 로그인 후 `api/notion-databases.js`가 그 사람이 허용한 데이터베이스 목록을 불러와 드롭다운에 보여줍니다.
- `Notion에 저장`을 누르면 `api/notion-push.js`가 그 사람의 토큰으로, 그 사람이 고른 데이터베이스에만 저장합니다.
- 데이터베이스 속성 이름은 사람마다 다를 수 있으므로, 제목 속성은 타입으로 자동 인식하고 과목/날짜/유형은 이름에 관련 키워드가 있는 속성이 있을 때만 채웁니다. 해당 속성이 없는 데이터베이스에 저장해도 나머지 항목은 정상적으로 들어갑니다.

`api/notion-push.js`는 붙여넣은 Markdown을 Notion 블록으로 변환해 저장합니다. 지원하는 문법은 다음과 같습니다.

- 제목(`#`, `##`, `###`), 목록, 체크박스(`- [ ]`)
- 표(`|`로 구분된 테이블)
- 코드 블록(````언어`)
- 인라인/블록 수식(`$...$`, `$$...$$`)
- 인용구(`>`)

블록이 100개를 넘는 노트는 자동으로 나눠서 이어붙입니다.

## 사용 흐름

1. `Todoist로 로그인`을 누릅니다.
2. Todoist 승인 화면에서 허용합니다.
3. 오늘 할 일을 불러오거나 직접 입력합니다.
4. 학습 할 일을 선택합니다.
5. Claude 프롬프트를 복사해 Claude에 붙여넣습니다.
6. Claude 결과를 다시 StudyLoop에 붙여넣습니다.
7. Notion용 Markdown이 자동으로 정리되면, `복사` 버튼으로 기존 Notion 템플릿에 직접 붙여넣거나 `Notion에 저장` 버튼으로 저장합니다.
8. `Notion에 저장`을 처음 쓴다면 먼저 `Notion으로 로그인`으로 본인 워크스페이스를 연결하고, 드롭다운에서 저장할 데이터베이스를 선택합니다.
9. 필요하면 복습 할 일을 Todoist에 추가합니다.

## 로컬 미리보기

정적 화면만 확인할 때는 아래 명령으로 열 수 있습니다.

```bash
python -m http.server 4173 --bind 127.0.0.1
```

```text
http://127.0.0.1:4173/
```

Todoist OAuth 로그인과 Notion OAuth 로그인/저장은 모두 Vercel 서버리스 함수와 환경변수가 필요하므로 배포 URL에서 확인하는 것이 가장 안정적입니다.
