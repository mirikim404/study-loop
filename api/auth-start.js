import crypto from "node:crypto";

const TODOIST_AUTHORIZE_URL = "https://todoist.com/oauth/authorize";

export default function handler(req, res) {
  const clientId = process.env.TODOIST_CLIENT_ID;
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;

  if (!clientId) {
    res.status(500).send("Missing TODOIST_CLIENT_ID environment variable.");
    return;
  }

  const state = crypto.randomBytes(24).toString("hex");
  const redirectUri = `${appUrl}/api/auth-callback`;
  const url = new URL(TODOIST_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "data:read_write");
  url.searchParams.set("state", state);

  res.setHeader(
    "Set-Cookie",
    `studyloop_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
  );
  res.writeHead(302, { Location: url.toString() });
  res.end();
}
