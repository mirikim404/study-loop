import crypto from "node:crypto";

const NOTION_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";

export default function handler(req, res) {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;

  if (!clientId || !clientSecret) {
    res.status(500).send("Missing Notion OAuth environment variables.");
    return;
  }

  const state = createSignedState(clientSecret);
  const redirectUri = `${appUrl}/api/notion-auth-callback`;

  const url = new URL(NOTION_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  // "user"로 두면 로그인한 사람이 직접 페이지/DB 접근 범위를 고르는 화면이 뜸
  url.searchParams.set("owner", "user");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  res.writeHead(302, { Location: url.toString() });
  res.end();
}

function createSignedState(secret) {
  const payload = {
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Date.now() + 10 * 60 * 1000,
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}
