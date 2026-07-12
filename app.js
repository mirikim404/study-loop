const TODOIST_API_BASE = "https://api.todoist.com/api/v1";

const STORAGE = {
  accessToken: "studyloop.todoistAccessToken",
  manualToken: "studyloop.todoistManualToken",
};

const state = {
  token: localStorage.getItem(STORAGE.accessToken) || localStorage.getItem(STORAGE.manualToken) || "",
  tasks: [],
  selectedTask: null,
};

const els = {
  connectionStatus: document.getElementById("connectionStatus"),
  loginButton: document.getElementById("loginButton"),
  logoutButton: document.getElementById("logoutButton"),
  tokenInput: document.getElementById("tokenInput"),
  saveTokenButton: document.getElementById("saveTokenButton"),
  clearTokenButton: document.getElementById("clearTokenButton"),
  loadTodayButton: document.getElementById("loadTodayButton"),
  manualTasks: document.getElementById("manualTasks"),
  analyzeManualButton: document.getElementById("analyzeManualButton"),
  taskList: document.getElementById("taskList"),
  subjectInput: document.getElementById("subjectInput"),
  scopeInput: document.getElementById("scopeInput"),
  taskTypeInput: document.getElementById("taskTypeInput"),
  materialTypeInput: document.getElementById("materialTypeInput"),
  goalInput: document.getElementById("goalInput"),
  levelInput: document.getElementById("levelInput"),
  promptOutput: document.getElementById("promptOutput"),
  claudeResult: document.getElementById("claudeResult"),
  markdownOutput: document.getElementById("markdownOutput"),
  reviewList: document.getElementById("reviewList"),
  createReviewButton: document.getElementById("createReviewButton"),
  toast: document.getElementById("toast"),
};

async function init() {
  els.tokenInput.value = localStorage.getItem(STORAGE.manualToken) || "";
  bindEvents();
  setTasks([]);
  clearSelectedTask();
  handleTokenRedirect();
  updateConnectionStatus();
}

function bindEvents() {
  els.loginButton.addEventListener("click", startTodoistLogin);
  els.logoutButton.addEventListener("click", clearToken);
  els.saveTokenButton.addEventListener("click", saveManualToken);
  els.clearTokenButton.addEventListener("click", clearToken);
  els.loadTodayButton.addEventListener("click", loadTodayTasks);
  els.analyzeManualButton.addEventListener("click", analyzeManualTasks);
  els.claudeResult.addEventListener("input", renderOutputs);
  els.createReviewButton.addEventListener("click", createReviewTasks);

  [
    els.subjectInput,
    els.scopeInput,
    els.taskTypeInput,
    els.materialTypeInput,
    els.goalInput,
    els.levelInput,
  ].forEach((input) => input.addEventListener("input", renderOutputs));

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", () => copyFrom(button.dataset.copyTarget));
  });
}

async function startTodoistLogin() {
  window.location.assign("/api/auth-start");
}

function handleTokenRedirect() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = params.get("todoist_token");
  const error = params.get("todoist_error");

  if (error) {
    showToast(`Todoist 로그인 실패: ${error}`);
    cleanUrl();
    return;
  }

  if (!token) return;

  localStorage.setItem(STORAGE.accessToken, token);
  localStorage.removeItem(STORAGE.manualToken);
  state.token = token;
  els.tokenInput.value = "";
  cleanUrl();
  showToast("Todoist 로그인이 완료됐어요.");
}

async function todoistFetch(path, options = {}, retry = true) {
  if (!state.token) throw new Error("Todoist is not connected");

  const response = await fetch(`${TODOIST_API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${state.token}`,
    },
  });

  if (response.status === 401 && retry) {
    clearToken(false);
    showToast("Todoist 로그인이 만료됐어요. 다시 로그인해주세요.");
  }

  return response;
}

function saveManualToken() {
  const token = els.tokenInput.value.trim();
  if (!token) {
    showToast("토큰을 입력해주세요.");
    return;
  }
  clearStoredOAuth();
  localStorage.setItem(STORAGE.manualToken, token);
  state.token = token;
  updateConnectionStatus();
  showToast("Todoist API 토큰을 직접 연결했어요.");
}

function clearToken(showMessage = true) {
  state.token = "";
  els.tokenInput.value = "";
  clearStoredOAuth();
  localStorage.removeItem(STORAGE.manualToken);
  updateConnectionStatus();
  if (showMessage) showToast("Todoist 연결을 해제했어요.");
}

function clearStoredOAuth() {
  localStorage.removeItem(STORAGE.accessToken);
}

function cleanUrl() {
  const clean = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, document.title, clean);
}

function updateConnectionStatus() {
  const hasOAuth = Boolean(localStorage.getItem(STORAGE.accessToken));
  if (state.token) {
    els.connectionStatus.textContent = hasOAuth ? "Todoist 로그인됨" : "토큰 연결됨";
    els.connectionStatus.classList.add("connected");
    els.loginButton.disabled = hasOAuth;
    els.logoutButton.disabled = false;
  } else {
    els.connectionStatus.textContent = "로그인 필요";
    els.connectionStatus.classList.remove("connected");
    els.loginButton.disabled = false;
    els.logoutButton.disabled = true;
  }
}

async function loadTodayTasks() {
  if (!state.token) {
    showToast("먼저 Todoist로 로그인해주세요.");
    return;
  }

  els.loadTodayButton.disabled = true;
  els.loadTodayButton.textContent = "불러오는 중";

  try {
    const response = await todoistFetch("/tasks/filter?query=today&limit=50");

    if (!response.ok) {
      throw new Error(`Todoist request failed: ${response.status}`);
    }

    const data = await response.json();
    const rawTasks = data.results || data.tasks || [];
    const studyTasks = rawTasks
      .map((task) => parseTask(task.content || task.text || "", task.project_name || "Todoist", task.id))
      .filter(Boolean);

    setTasks(studyTasks);
    if (studyTasks[0]) selectTask(studyTasks[0]);
    showToast(studyTasks.length ? "오늘의 학습 할 일을 불러왔어요." : "학습 형식의 할 일을 찾지 못했어요.");
  } catch (error) {
    console.error(error);
    showToast("Todoist를 불러오지 못했어요. 로그인 상태를 확인해주세요.");
  } finally {
    els.loadTodayButton.disabled = false;
    els.loadTodayButton.textContent = "오늘 할 일 불러오기";
  }
}

function analyzeManualTasks() {
  const lines = els.manualTasks.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const tasks = lines.map((line) => parseTask(line, "직접 입력")).filter(Boolean);
  setTasks(tasks);
  if (tasks[0]) selectTask(tasks[0]);
  showToast(tasks.length ? "직접 입력한 할 일을 분석했어요." : "분석할 학습 할 일을 찾지 못했어요.");
}

function parseTask(content, source = "", id = createId()) {
  const text = content.trim();
  if (!text) return null;

  const hasColon = text.includes(":") || text.includes("：");
  let subject = "";
  let detail = text;

  if (hasColon) {
    const parts = text.split(/[:：]/);
    subject = parts.shift().trim();
    detail = parts.join(":").trim();
  } else {
    const match = text.match(/^([^\s]+)\s+(.+)$/);
    if (match) {
      subject = match[1].trim();
      detail = match[2].trim();
    }
  }

  const studyWords = ["정리", "복습", "문제", "풀이", "차시", "강의", "PDF", "pdf", "과제", "시험", "실습"];
  const looksLikeStudy = hasColon || studyWords.some((word) => text.includes(word));
  if (!looksLikeStudy || !subject) return null;

  const type = detectTaskType(detail);
  const scope = detail
    .replace(/(정리|복습|문제풀이|문제\s*풀이|과제|시험\s*대비|강의|PDF|pdf)/g, "")
    .replace(/\s+/g, " ")
    .trim() || detail;

  const domain = detectDomain(subject, detail);

  return {
    id,
    raw: text,
    source,
    subject,
    scope,
    type,
    goal: domain === "bootcamp" ? "실습 정리" : type === "문제풀이" ? "개념 이해" : "시험 대비",
    material: domain === "bootcamp" ? "실습자료" : "PDF",
    level: domain === "bootcamp" ? "초급 학습자" : "대학생",
    domain,
  };
}

function detectTaskType(text) {
  if (/문제\s*풀이|풀이/.test(text)) return "문제풀이";
  if (text.includes("복습")) return "복습";
  if (text.includes("과제")) return "과제";
  if (text.includes("시험")) return "시험 대비";
  return "정리";
}

function detectDomain(subject, detail) {
  const joined = `${subject} ${detail}`.toLowerCase();
  if (joined.includes("boot") || joined.includes("부트캠프") || joined.includes("outta") || joined.includes("실습")) {
    return "bootcamp";
  }
  if (joined.includes("자료구조") || joined.includes("운영체제") || joined.includes("알고리즘") || joined.includes("코드")) {
    return "engineering";
  }
  if (joined.includes("미분") || joined.includes("적분") || joined.includes("수학") || joined.includes("통계")) {
    return "math";
  }
  return "general";
}

function setTasks(tasks) {
  state.tasks = tasks;
  if (!tasks.length) {
    state.selectedTask = null;
    clearSelectedTask();
  }
  renderTaskList();
}

function renderTaskList() {
  els.taskList.innerHTML = "";

  if (!state.tasks.length) {
    els.taskList.innerHTML = '<div class="empty-state">학습 할 일이 아직 없습니다.<br />Todoist를 불러오거나 직접 입력해보세요.</div>';
    return;
  }

  state.tasks.forEach((task) => {
    const card = document.createElement("article");
    card.className = `task-card ${state.selectedTask?.id === task.id ? "selected" : ""}`;
    card.innerHTML = `
      <div>
        <div class="task-title">${escapeHtml(task.subject)} - ${escapeHtml(task.scope)}</div>
        <div class="task-meta">${escapeHtml(task.raw)}</div>
        <div class="tag-row">
          <span class="tag accent">${escapeHtml(task.type)}</span>
          <span class="tag">${escapeHtml(task.goal)}</span>
          <span class="tag coral">${escapeHtml(task.source)}</span>
        </div>
      </div>
      <button class="secondary compact" type="button">선택</button>
    `;
    card.querySelector("button").addEventListener("click", () => selectTask(task));
    els.taskList.appendChild(card);
  });
}

function selectTask(task) {
  state.selectedTask = task;
  els.subjectInput.value = task.subject;
  els.scopeInput.value = task.scope;
  els.taskTypeInput.value = task.type;
  els.materialTypeInput.value = task.material;
  els.goalInput.value = task.goal;
  els.levelInput.value = task.level;
  renderTaskList();
  renderOutputs();
}

function clearSelectedTask() {
  els.subjectInput.value = "";
  els.scopeInput.value = "";
  els.taskTypeInput.value = "정리";
  els.materialTypeInput.value = "PDF";
  els.goalInput.value = "시험 대비";
  els.levelInput.value = "대학생";
  els.promptOutput.value = "Todoist에서 오늘 할 일을 불러오거나 직접 입력을 분석하면 Claude 프롬프트가 생성됩니다.";
  els.markdownOutput.value = "Claude 결과를 붙여넣으면 Notion용 Markdown이 생성됩니다.";
  renderReviewList(getConfig());
}

function getConfig() {
  return {
    subject: els.subjectInput.value.trim() || "선택한 과목",
    scope: els.scopeInput.value.trim() || "선택한 범위",
    type: els.taskTypeInput.value,
    material: els.materialTypeInput.value,
    goal: els.goalInput.value,
    level: els.levelInput.value,
    domain: detectDomain(els.subjectInput.value, els.scopeInput.value),
  };
}

function renderOutputs() {
  const config = getConfig();
  els.promptOutput.value = buildClaudePrompt(config);
  els.markdownOutput.value = buildNotionMarkdown(config, els.claudeResult.value.trim());
  renderReviewList(config);
}

function buildClaudePrompt(config) {
  const role = getRole(config);
  const sections = getSections(config);
  const example = getExample(config);

  return `목표: 첨부한 ${config.material}를 바탕으로 "${config.subject} ${config.scope}" ${config.goal}용 학습노트를 만들어줘.

역할: 너는 ${role}.
청중: ${config.level}이며, Notion에 붙여넣어 복습할 수 있는 밀도 있는 학습노트가 필요해.

중요 기준:
- 본론부터 바로 시작해줘.
- 자료에 없는 내용을 단정하지 말고, 추론한 내용은 "추론"이라고 표시해줘.
- 개념, 예시, 실수 포인트를 분리해서 정리해줘.
- 긴 설명보다 시험/복습에 다시 쓰기 쉬운 구조를 우선해줘.

작업 순서:
1. 먼저 자료의 핵심 주제와 흐름을 파악해줘.
2. ${config.goal}에 중요한 개념을 우선순위로 골라줘.
3. 각 개념을 정의, 의미, 사용 조건, 예시로 나눠 설명해줘.
4. 헷갈리기 쉬운 부분과 자주 틀리는 포인트를 따로 정리해줘.
5. 마지막에 복습 체크리스트와 예상 질문을 만들어줘.

예시:
${example}

출력 형식:
# ${config.subject} - ${config.scope}
${sections.map((section) => `## ${section}`).join("\n")}

Markdown으로 출력해줘. Notion에 바로 붙여넣을 수 있게 제목 계층을 유지하고, 수식은 LaTeX 표기, 코드는 코드블록으로 정리해줘.`;
}

function getRole(config) {
  if (config.domain === "math") return `${config.subject}을 쉽게 풀어 설명하는 대학 전공 튜터야`;
  if (config.domain === "bootcamp") return "AI/데이터 부트캠프 실습 내용을 구조화해주는 학습 코치야";
  if (config.domain === "engineering") return "컴퓨터공학 개념과 코드 흐름을 연결해 설명하는 전공 튜터야";
  return `${config.subject} 학습을 돕는 전문 튜터야`;
}

function getSections(config) {
  if (config.domain === "bootcamp") {
    return ["오늘 배운 것", "핵심 개념", "실습 흐름", "코드/명령어 정리", "오류와 해결", "복습 체크리스트", "다음에 할 일"];
  }
  if (config.domain === "math") {
    return ["핵심 요약", "주요 개념", "공식 정리", "예제 풀이", "헷갈리는 포인트", "예상 문제", "복습 체크리스트"];
  }
  if (config.domain === "engineering") {
    return ["핵심 요약", "주요 개념", "알고리즘/구조", "코드 예시", "시간복잡도/주의점", "예상 문제", "복습 체크리스트"];
  }
  return ["핵심 요약", "주요 개념", "상세 정리", "예시", "헷갈리는 포인트", "복습 질문", "체크리스트"];
}

function getExample(config) {
  if (config.domain === "bootcamp") {
    return `- 개념: API 요청은 클라이언트가 서버에 데이터를 요청하거나 전송하는 방식이다.
- 실습: 요청 주소, 인증 정보, 응답 데이터 구조를 확인한다.
- 복습 질문: 이 실습에서 입력, 처리, 출력은 각각 무엇인가?`;
  }
  if (config.domain === "math") {
    return `- 정의: 핵심 개념을 한 문장으로 설명한다.
- 공식: 공식의 의미와 적용 조건을 함께 적는다.
- 예제: 문제에서 어떤 조건을 보고 공식을 선택하는지 설명한다.`;
  }
  return `- 개념: 용어를 먼저 정의한다.
- 흐름: 왜 필요한지와 어디에 쓰이는지 연결한다.
- 점검: 시험이나 과제에서 틀리기 쉬운 지점을 따로 표시한다.`;
}

function buildNotionMarkdown(config, claudeText) {
  const date = new Date().toISOString().slice(0, 10);
  const body = claudeText || "_Claude 결과를 붙여넣으면 이 영역에 정리된 노트가 들어갑니다._";

  return `# ${config.subject} - ${config.scope}

- 날짜: ${date}
- 작업 유형: ${config.type}
- 목표: ${config.goal}
- 자료 유형: ${config.material}
- 상태: 정리 중

---

${body}

---

## 복습 체크
- [ ] 핵심 개념을 말로 설명하기
- [ ] 헷갈리는 포인트 3개 표시하기
- [ ] 관련 문제 또는 실습 1개 다시 풀기

## 다음 할 일
- [ ] ${config.subject} ${config.scope} 1차 복습
- [ ] ${config.subject} ${config.scope} 문제/실습 재확인`;
}

function renderReviewList(config) {
  const items = getReviewTasks(config);
  els.reviewList.innerHTML = items
    .map(
      (item) => `
        <div class="review-item">
          <strong>${escapeHtml(item.content)}</strong>
          <span>${escapeHtml(item.due_string)} · ${escapeHtml(item.description)}</span>
        </div>
      `,
    )
    .join("");
}

function getReviewTasks(config) {
  return [
    {
      content: `${config.subject} ${config.scope} 1차 복습`,
      due_string: "tomorrow",
      description: "학습노트 핵심 요약과 체크리스트 확인",
    },
    {
      content: `${config.subject} ${config.scope} 문제/실습 재확인`,
      due_string: "in 3 days",
      description: "예상 문제 또는 실습 흐름 다시 풀기",
    },
    {
      content: `${config.subject} ${config.scope} 최종 점검`,
      due_string: "next week",
      description: "헷갈리는 포인트만 빠르게 재점검",
    },
  ];
}

async function createReviewTasks() {
  if (!state.token) {
    showToast("Todoist로 로그인해야 복습 할 일을 추가할 수 있어요.");
    return;
  }

  const config = getConfig();
  const tasks = getReviewTasks(config);
  els.createReviewButton.disabled = true;
  els.createReviewButton.textContent = "추가 중";

  try {
    for (const task of tasks) {
      const response = await todoistFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: task.content,
          description: task.description,
          due_string: task.due_string,
          labels: ["study-review"],
        }),
      });

      if (!response.ok) {
        throw new Error(`Review task creation failed: ${response.status}`);
      }
    }
    showToast("복습 할 일을 Todoist에 추가했어요.");
  } catch (error) {
    console.error(error);
    showToast("복습 할 일을 추가하지 못했어요.");
  } finally {
    els.createReviewButton.disabled = false;
    els.createReviewButton.textContent = "복습 할 일 추가";
  }
}

async function copyFrom(id) {
  const target = document.getElementById(id);
  if (!target?.value) {
    showToast("복사할 내용이 없어요.");
    return;
  }

  try {
    await navigator.clipboard.writeText(target.value);
    showToast("클립보드에 복사했어요.");
  } catch {
    target.select();
    document.execCommand("copy");
    showToast("클립보드에 복사했어요.");
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

init();
