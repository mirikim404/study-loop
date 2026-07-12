
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    res.status(500).json({ error: "Missing Notion environment variables" });
    return;
  }

  const { subject, scope, type, markdown } = req.body;

  if (!subject || !markdown) {
    res.status(400).json({ error: "subject and markdown are required" });
    return;
  }

  const title = `${subject} - ${scope || ""}`.trim();
  const today = new Date().toISOString().slice(0, 10);

  console.log("DEBUG markdown length:", markdown.length);
  console.log("DEBUG raw markdown (first 300):", markdown.slice(0, 300));

  try {
    const blocks = markdownToBlocks(markdown);

    // Notion pages.create는 children을 최대 100개까지만 한 번에 받음
    const firstBatch = blocks.slice(0, 100);
    const remaining = blocks.slice(100);

    const createRes = await fetch(`${NOTION_API_BASE}/pages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          "제목": {
            title: [{ text: { content: title } }],
          },
          "과목": {
            rich_text: [{ text: { content: subject } }],
          },
          "날짜": {
            date: { start: today },
          },
          "유형": {
            select: { name: type || "정리" },
          },
        },
        children: firstBatch,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("Notion API error", createRes.status, errText);
      res.status(502).json({ error: "Notion API request failed", detail: errText });
      return;
    }

    const data = await createRes.json();

    // 100개 넘는 블록은 append로 이어붙이기 (100개씩 나눠서)
    for (let i = 0; i < remaining.length; i += 100) {
      const chunk = remaining.slice(i, i + 100);
      const appendRes = await fetch(`${NOTION_API_BASE}/blocks/${data.id}/children`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ children: chunk }),
      });
      if (!appendRes.ok) {
        const errText = await appendRes.text();
        console.error("Notion append error", appendRes.status, errText);
        // 페이지 자체는 이미 생성됐으므로 에러여도 계속 진행
        break;
      }
    }

    res.status(200).json({ success: true, pageUrl: data.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

// ---------- Markdown -> Notion blocks ----------

function markdownToBlocks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let inCodeBlock = false;
  let codeLines = [];
  let codeLanguage = "plain text";
  let tableBuffer = [];

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    blocks.push(buildTableBlock(tableBuffer));
    tableBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 코드블록 처리
    if (line.trim().startsWith("```")) {
      flushTable();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = line.trim().slice(3).trim() || "plain text";
        codeLines = [];
      } else {
        inCodeBlock = false;
        blocks.push({
          object: "block",
          type: "code",
          code: {
            rich_text: [{ type: "text", text: { content: codeLines.join("\n").slice(0, 2000) } }],
            language: mapLanguage(codeLanguage),
          },
        });
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // 표 라인 감지: | 로 시작하고 끝나는 라인
    const isTableRow = /^\s*\|.*\|\s*$/.test(line);
    const isTableSeparator = /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");

    if (isTableRow) {
      if (!isTableSeparator) {
        tableBuffer.push(parseTableRow(line));
      }
      continue;
    } else if (tableBuffer.length > 0) {
      flushTable();
    }

    if (!line.trim()) continue;

    // 독립된 $$...$$ 블록 수식 (한 줄 전체가 수식인 경우)
    const blockMathMatch = line.trim().match(/^\$\$(.+)\$\$$/);
    if (blockMathMatch) {
      blocks.push({
        object: "block",
        type: "equation",
        equation: { expression: blockMathMatch[1].trim() },
      });
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(headingBlock(3, line.slice(4)));
    } else if (line.startsWith("## ")) {
      blocks.push(headingBlock(2, line.slice(3)));
    } else if (line.startsWith("# ")) {
      blocks.push(headingBlock(1, line.slice(2)));
    } else if (/^[-*]\s+\[[ x]\]\s+/i.test(line)) {
      const checked = /\[x\]/i.test(line);
      const text = line.replace(/^[-*]\s+\[[ x]\]\s+/i, "");
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: parseInlineRichText(text),
          checked,
        },
      });
    } else if (/^[-*]\s+/.test(line)) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: parseInlineRichText(line.replace(/^[-*]\s+/, "")),
        },
      });
    } else if (/^\d+\.\s+/.test(line)) {
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: parseInlineRichText(line.replace(/^\d+\.\s+/, "")),
        },
      });
    } else if (line.trim() === "---") {
      blocks.push({ object: "block", type: "divider", divider: {} });
    } else {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: parseInlineRichText(line),
        },
      });
    }
  }

  flushTable();

  return blocks;
}

function headingBlock(level, text) {
  const type = level === 1 ? "heading_1" : level === 2 ? "heading_2" : "heading_3";
  return {
    object: "block",
    type,
    [type]: {
      rich_text: parseInlineRichText(text),
    },
  };
}

// 표 한 행을 셀 배열로 파싱: "| a | b | c |" -> ["a", "b", "c"]
function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function buildTableBlock(rows) {
  const columnCount = Math.max(...rows.map((r) => r.length));
  const tableRows = rows.map((row) => ({
    object: "block",
    type: "table_row",
    table_row: {
      cells: Array.from({ length: columnCount }, (_, i) =>
        parseInlineRichText(row[i] || ""),
      ),
    },
  }));

  return {
    object: "block",
    type: "table",
    table: {
      table_width: columnCount,
      has_column_header: true,
      has_row_header: false,
      children: tableRows,
    },
  };
}

// 인라인 텍스트를 Notion rich_text 배열로 변환
// 처리: **볼드**, *이탤릭*, `코드`, $인라인수식$
function parseInlineRichText(text) {
  if (!text) return [{ type: "text", text: { content: "" } }];

  const segments = [];
  // 토큰화: $$...$$(굳이 처리 안 해도 되지만 방어), **bold**, `code`, $math$, *italic* 순서로 시도
  // 볼드(**)를 이탤릭(*)보다 반드시 먼저 검사해야 ** 안의 별표가 * 하나로 잘못 매치되지 않음
  const tokenRegex = /(\*\*[^*]+?\*\*|`[^`]+?`|\$[^$]+?\$|\*[^*]+?\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushPlainText(segments, text.slice(lastIndex, match.index));
    }

    const token = match[0];

    if (token.startsWith("**")) {
      pushAnnotatedText(segments, token.slice(2, -2), { bold: true });
    } else if (token.startsWith("`")) {
      pushAnnotatedText(segments, token.slice(1, -1), { code: true });
    } else if (token.startsWith("$")) {
      segments.push({
        type: "equation",
        equation: { expression: token.slice(1, -1) },
      });
    } else if (token.startsWith("*")) {
      pushAnnotatedText(segments, token.slice(1, -1), { italic: true });
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    pushPlainText(segments, text.slice(lastIndex));
  }

  if (segments.length === 0) {
    segments.push({ type: "text", text: { content: "" } });
  }

  // Notion rich_text 배열은 최대 100개, 각 content는 2000자 제한
  return segments.slice(0, 100).map((seg) => {
    if (seg.type === "equation") {
      return {
        type: "equation",
        equation: { expression: seg.equation.expression.slice(0, 1000) },
      };
    }
    return {
      type: "text",
      text: { content: seg.text.content.slice(0, 2000) },
      annotations: seg.annotations,
    };
  });
}

function pushPlainText(segments, text) {
  if (!text) return;
  segments.push({ type: "text", text: { content: text } });
}

function pushAnnotatedText(segments, text, annotations) {
  if (!text) return;
  segments.push({ type: "text", text: { content: text }, annotations });
}

function mapLanguage(lang) {
  const known = [
    "javascript", "python", "java", "c", "c++", "sql", "bash",
    "json", "html", "css", "plain text", "typescript", "shell",
  ];
  const normalized = lang.toLowerCase();
  return known.includes(normalized) ? normalized : "plain text";
}
