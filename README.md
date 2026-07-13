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

## Notion 연동 설정

`Notion에 저장` 버튼을 쓰려면 Notion Integration을 만들고 대상 데이터베이스에 연결해야 합니다.

1. [Notion Integrations](https://www.notion.so/my-integrations)에서 새 Integration을 만들고 `Internal Integration Secret`을 발급받습니다.
2. 학습노트를 저장할 Notion 데이터베이스에 방금 만든 Integration을 연결(Connect)합니다.
3. 데이터베이스에 아래 속성이 반드시 있어야 합니다.

   | 속성명 | 타입 |
   | --- | --- |
   | 제목 | Title |
   | 과목 | Select |
   | 날짜 | Date |
   | 유형 | Select |

4. Vercel 환경변수에 아래 값을 추가합니다.

```text
NOTION_API_KEY=Notion Integration Secret
NOTION_DATABASE_ID=저장할 데이터베이스 ID
```

환경변수를 추가/변경한 뒤에는 Vercel에서 다시 배포해야 적용됩니다.

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
7. Notion용 Markdown이 자동으로 정리되면, `복사` 버튼으로 기존 Notion 템플릿에 직접 붙여넣거나 `Notion에 저장` 버튼으로 연결된 데이터베이스에 바로 저장합니다.
8. 필요하면 복습 할 일을 Todoist에 추가합니다.

## 로컬 미리보기

정적 화면만 확인할 때는 아래 명령으로 열 수 있습니다.

```bash
python -m http.server 4173 --bind 127.0.0.1
```

```text
http://127.0.0.1:4173/
```

Todoist OAuth 로그인과 Notion 저장은 Vercel 서버리스 함수와 환경변수가 필요하므로 배포 URL에서 확인하는 것이 가장 안정적입니다.
