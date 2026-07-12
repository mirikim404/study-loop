# StudyLoop

Todoist의 오늘 할 일을 바탕으로 Claude용 학습노트 프롬프트를 만들고, Claude 결과를 Notion 템플릿에 붙여넣기 쉬운 Markdown으로 정리하는 웹앱입니다.

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

환경변수를 추가한 뒤 Vercel에서 다시 배포해야 합니다.

## 사용 흐름

1. `Todoist로 로그인`을 누릅니다.
2. Todoist 승인 화면에서 허용합니다.
3. 오늘 할 일을 불러오거나 직접 입력합니다.
4. 학습 할 일을 선택합니다.
5. Claude 프롬프트를 복사해 Claude에 붙여넣습니다.
6. Claude 결과를 다시 StudyLoop에 붙여넣습니다.
7. Notion용 Markdown을 복사해 기존 Notion 학습 템플릿에 넣습니다.
8. 필요하면 복습 할 일을 Todoist에 추가합니다.

## 로컬 미리보기

정적 화면만 확인할 때는 아래 명령으로 열 수 있습니다.

```bash
python -m http.server 4173 --bind 127.0.0.1
```

```text
http://127.0.0.1:4173/
```

Todoist OAuth 로그인은 Vercel 서버리스 함수와 환경변수가 필요하므로 배포 URL에서 확인하는 것이 가장 안정적입니다.
