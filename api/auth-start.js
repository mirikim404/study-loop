import crypto from "node:crypto";

const TODOIST_AUTHORIZE_URL = "https://todoist.com/oauth/authorize";

export default function handler(req, res) {
  const clientId = process.env.TODOIST_CLIENT_ID;
  const clientSecret = process.env.TODOIST_CLIENT_SECRET;
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;

  if (!clientId || !clientSecret) {
    res.status(500).send("Missing Todoist OAuth environment variables.");
    return;
  }

  const state = createSignedState(clientSecret);
  const redirectUri = `${appUrl}/api/auth-callback`;
  const url = new URL(TODOIST_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "data:read_write");
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
