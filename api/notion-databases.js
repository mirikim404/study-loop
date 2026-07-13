const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing Notion access token" });
    return;
  }

  try {
    const response = await fetch(`${NOTION_API_BASE}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: { property: "object", value: "database" },
        page_size: 50,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Notion search failed", response.status, text);
      res.status(response.status === 401 ? 401 : 502).json({
        error: "Notion 데이터베이스 목록을 불러오지 못했습니다.",
      });
      return;
    }

    const data = await response.json();
    const databases = (data.results || []).map((db) => ({
      id: db.id,
      title: extractTitle(db),
    }));

    res.status(200).json({ databases });
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

function extractTitle(db) {
  const titleArray = db.title || [];
  const text = titleArray.map((t) => t.plain_text).join("").trim();
  return text || "제목 없는 데이터베이스";
}
