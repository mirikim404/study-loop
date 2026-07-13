const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Notion 연결이 필요합니다. 먼저 Notion으로 로그인해주세요." });
    return;
  }

  const { databaseId, subject, scope, type, markdown } = req.body;

  if (!databaseId) {
    res.status(400).json({ error: "저장할 Notion 데이터베이스를 먼저 선택해주세요." });
    return;
  }
  if (!subject || !markdown) {
    res.status(400).json({ error: "subject and markdown are required" });
    return;
  }

  const title = `${subject} - ${scope || ""}`.trim();
  const today = new Date().toISOString().slice(0, 10);

  try {
    const schemaRes = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
      },
    });

    if (!schemaRes.ok) {
      const errText = await schemaRes.text();
      console.error("Notion schema fetch failed", schemaRes.status, errText);
      res.status(schemaRes.status === 401 ? 401 : 502).json({
        error: "Notion 데이터베이스 정보를 불러오지 못했습니다.",
      });
      return;
    }

    const schema = await schemaRes.json();
    const properties = buildProperties(schema.properties || {}, { title, subject, type, today });

    const blocks = markdownToBlocks(markdown);

    // Notion pages.create는 children을 최대 100개까지만 한 번에 받음
    const firstBatch = blocks.slice(0, 100);
    const remaining = blocks.slice(100);

    const createRes = await fetch(`${NOTION_API_BASE}/pages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties,
        children: firstBatch,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("Notion API error", createRes.status, errText);
      res.status(createRes.status === 401 ? 401 : 502).json({
        error: "Notion API request failed",
        detail: errText,
      });
      return;
    }

    const data = await createRes.json();

    // 100개 넘는 블록은 append로 이어붙이기 (100개씩 나눠서)
    for (let i = 0; i < remaining.length; i += 100) {
      const chunk = remaining.slice(i, i + 100);
      const appendRes = await fetch(`${NOTION_API_BASE}/blocks/${data.id}/children`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ children: chunk }),
      });
      if (!appendRes.ok) {
        const errText = await appendRes.text();
        console.error("Notion append error", appendRes.status, errText);
        break;
      }
    }

    res.status(200).json({ success: true, pageUrl: data.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

function extractToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// 사용자가 OAuth로 고른 데이터베이스는 저마다 속성 구성이 다를 수 있으므로,
// title 속성은 이름과 무관하게 type이 "title"인 속성을 찾아서 채우고,
// 과목/날짜/유형은 이름에 관련 키워드가 들어간 속성이 "있을 때만" 채운다.
function buildProperties(schema, { title, subject, type, today }) {
  const properties = {};

  const titleKey = Object.keys(schema).find((key) => schema[key].type === "title");
  if (titleKey) {
    properties[titleKey] = { title: [{ text: { content: title } }] };
  }

  const subjectKey = findPropertyKey(schema, ["과목", "subject"], "select");
  if (subjectKey) {
    properties[subjectKey] = { select: { name: subject } };
  }

  const dateKey = findPropertyKey(schema, ["날짜", "date"], "date");
  if (dateKey) {
    properties[dateKey] = { date: { start: today } };
  }

  const typeKey = findPropertyKey(schema, ["유형", "타입", "type"], "select");
  if (typeKey) {
    properties[typeKey] = { select: { name: type || "정리" } };
  }

  return properties;
}

function findPropertyKey(schema, keywords, expectedType) {
  return Object.keys(schema).find((key) => {
    if (schema[key].type !== expectedType) return false;
    const lowerKey = key.toLowerCase();
    return keywords.some((word) => lowerKey.includes(word.toLowerCase()));
  });
}

// ---------- Markdown -> Notion blocks ----------

function sanitizeMath(expr) {
  if (!expr) return " ";
  return expr.replace(/·/g, ", ");
}

function markdownToBlocks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];

  let inCodeBlock = false;
  let codeLines = [];
  let codeLanguage = "plain text";

  let inMathBlock = false;
  let mathLines = [];

  let tableBuffer = [];

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    blocks.push(buildTableBlock(tableBuffer));
    tableBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      flushTable();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = line.trim().slice(3).trim() || "plain text";
        codeLines = [];
      } else {
        inCodeBlock = false;
        const fullCode = codeLines.join("\n");
        const richTextChunks = [];

        for (let j = 0; j < fullCode.length; j += 2000) {
          richTextChunks.push({
            type: "text",
            text: { content: fullCode.slice(j, j + 2000) },
          });
        }

        if (richTextChunks.length === 0) {
          richTextChunks.push({ type: "text", text: { content: "" } });
        }

        blocks.push({
          object: "block",
          type: "code",
          code: {
            rich_text: richTextChunks.slice(0, 100),
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

    if (line.trim() === "$$") {
      flushTable();
      if (!inMathBlock) {
        inMathBlock = true;
        mathLines = [];
      } else {
        inMathBlock = false;
        blocks.push({
          object: "block",
          type: "equation",
          equation: { expression: sanitizeMath(mathLines.join("\n").trim()) },
        });
      }
      continue;
    }

    if (inMathBlock) {
      mathLines.push(line);
      continue;
    }

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

    const blockMathMatch = line.trim().match(/^\$\$(.+)\$\$$/);
    if (blockMathMatch) {
      flushTable();
      blocks.push({
        object: "block",
        type: "equation",
        equation: { expression: sanitizeMath(blockMathMatch[1].trim()) },
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
    } else if (line.trim().startsWith(">")) {
      const text = line.trim().replace(/^>\s*/, "");
      blocks.push({
        object: "block",
        type: "quote",
        quote: {
          rich_text: parseInlineRichText(text),
        },
      });
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

  if (inMathBlock) {
    blocks.push({
      object: "block",
      type: "equation",
      equation: { expression: sanitizeMath(mathLines.join("\n").trim()) },
    });
  }

  return blocks;
}

function headingBlock(level, text) {
  const type = level === 1 ? "heading_1" : level === 2 ? "heading_2" : "heading_3";
  return {
    object: "block",
    type,
    [type]: { rich_text: parseInlineRichText(text) },
  };
}

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
      cells: Array.from({ length: columnCount }, (_, i) => parseInlineRichText(row[i] || "")),
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

function parseInlineRichText(text) {
  if (!text) return [{ type: "text", text: { content: "" } }];

  const segments = [];
  const tokenRegex = /(\*\*[^*]+?\*\*|`[^`]+?`|\$\$.+?\$\$|\$[^$]+?\$|\*[^*]+?\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushPlainText(segments, text.slice(lastIndex, match.index));
    }

    const token = match[0];

    if (token.startsWith("**")) {
      const innerText = token.slice(2, -2);
      if (innerText.startsWith("$") && innerText.endsWith("$") && innerText.length > 2) {
        segments.push({
          type: "equation",
          equation: { expression: sanitizeMath(innerText.slice(1, -1)) },
          annotations: { bold: true },
        });
      } else {
        pushAnnotatedText(segments, innerText, { bold: true });
      }
    } else if (token.startsWith("`")) {
      pushAnnotatedText(segments, token.slice(1, -1), { code: true });
    } else if (token.startsWith("$$") && token.endsWith("$$")) {
      segments.push({
        type: "equation",
        equation: { expression: sanitizeMath(token.slice(2, -2).trim()) },
      });
    } else if (token.startsWith("$")) {
      segments.push({
        type: "equation",
        equation: { expression: sanitizeMath(token.slice(1, -1).trim()) },
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

  return segments.slice(0, 100).map((seg) => {
    if (seg.type === "equation") {
      return {
        type: "equation",
        equation: { expression: seg.equation.expression.slice(0, 1000) },
        annotations: seg.annotations || undefined,
      };
    }
    return seg;
  });
}

function pushPlainText(segments, text) {
  if (!text) return;
  for (let i = 0; i < text.length; i += 2000) {
    segments.push({ type: "text", text: { content: text.slice(i, i + 2000) } });
  }
}

function pushAnnotatedText(segments, text, annotations) {
  if (!text) return;
  for (let i = 0; i < text.length; i += 2000) {
    segments.push({ type: "text", text: { content: text.slice(i, i + 2000) }, annotations });
  }
}

function mapLanguage(lang) {
  const known = [
    "javascript", "python", "java", "c", "c++", "sql", "bash",
    "json", "html", "css", "plain text", "typescript", "shell",
  ];
  const normalized = lang.toLowerCase();
  return known.includes(normalized) ? normalized : "plain text";
}
