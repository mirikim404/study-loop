import crypto from "node:crypto";

const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

export default async function handler(req, res) {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
  const { code, state, error } = req.query;

  if (error) {
    redirectWithError(res, appUrl, error);
    return;
  }
  if (!clientId || !clientSecret) {
    res.status(500).send("Missing Notion OAuth environment variables.");
    return;
  }
  if (!code || !state || !verifySignedState(state, clientSecret)) {
    redirectWithError(res, appUrl, "state_mismatch");
    return;
  }

  try {
    const redirectUri = `${appUrl}/api/notion-auth-callback`;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetch(NOTION_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Notion token exchange failed", response.status, text);
      redirectWithError(res, appUrl, "token_exchange_failed");
      return;
    }

    const payload = await response.json();
    // access_token은 이 사람이 방금 허용한 워크스페이스/페이지 범위에만 접근 가능한 개인 토큰
    const token = encodeURIComponent(payload.access_token);
    const workspaceName = encodeURIComponent(payload.workspace_name || "");

    res.writeHead(302, {
      Location: `${appUrl}/#notion_token=${token}&notion_workspace=${workspaceName}`,
    });
    res.end();
  } catch (err) {
    console.error(err);
    redirectWithError(res, appUrl, "server_error");
  }
}

function verifySignedState(state, secret) {
  const [encodedPayload, signature] = String(state).split(".");
  if (!encodedPayload || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  if (signature.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;

  try {
    const payloadJson = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return typeof payloadJson.exp === "number" && Date.now() < payloadJson.exp;
  } catch {
    return false;
  }
}

function redirectWithError(res, appUrl, error) {
  res.writeHead(302, { Location: `${appUrl}/#notion_error=${encodeURIComponent(error)}` });
  res.end();
}
