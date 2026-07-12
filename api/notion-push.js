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

  try {
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
            select: { name: subject },
          },
          "날짜": {
            date: { start: today },
          },
          "유형": {
            select: { name: type || "정리" },
          },
        },
        children: markdownToBlocks(markdown),
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("Notion API error", createRes.status, errText);
      res.status(502).json({ error: "Notion API request failed", detail: errText });
      return;
    }

    const data = await createRes.json();
    res.status(200).json({ success: true, pageUrl: data.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

// 간단한 Markdown → Notion 블록 변환 (제목, 리스트, 코드블록, 일반 텍스트 처리)
function markdownToBlocks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let inCodeBlock = false;
  let codeLines = [];
  let codeLanguage = "plain text";

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
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

    if (!line.trim()) continue;

    if (line.startsWith("### ")) {
      blocks.push(headingBlock(3, line.slice(4)));
    } else if (line.startsWith("## ")) {
      blocks.push(headingBlock(2, line.slice(3)));
    } else if (line.startsWith("# ")) {
      blocks.push(headingBlock(1, line.slice(2)));
    } else if (/^[-*]\s+\[[ x]\]\s+/.test(line)) {
      const checked = /\[x\]/i.test(line);
      const text = line.replace(/^[-*]\s+\[[ x]\]\s+/i, "");
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }],
          checked,
        },
      });
    } else if (/^[-*]\s+/.test(line)) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: line.replace(/^[-*]\s+/, "").slice(0, 2000) } }],
        },
      });
    } else if (line.trim() === "---") {
      blocks.push({ object: "block", type: "divider", divider: {} });
    } else {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: line.slice(0, 2000) } }],
        },
      });
    }
  }

  return blocks.slice(0, 100); // Notion API 한 번 호출 시 최대 100블록 제한
}

function headingBlock(level, text) {
  const type = level === 1 ? "heading_1" : level === 2 ? "heading_2" : "heading_3";
  return {
    object: "block",
    type,
    [type]: {
      rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }],
    },
  };
}

function mapLanguage(lang) {
  const known = ["javascript", "python", "java", "c", "c++", "sql", "bash", "json", "html", "css", "plain text"];
  const normalized = lang.toLowerCase();
  return known.includes(normalized) ? normalized : "plain text";
}
