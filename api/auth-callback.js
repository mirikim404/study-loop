import crypto from "node:crypto";
const TODOIST_TOKEN_URL = "https://todoist.com/oauth/access_token";

export default async function handler(req, res) {
  const clientId = process.env.TODOIST_CLIENT_ID;
  const clientSecret = process.env.TODOIST_CLIENT_SECRET;
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
  const { code, state, error } = req.query;

  console.log("DEBUG appUrl:", appUrl);
  console.log("DEBUG received state:", state);
  console.log("DEBUG clientSecret length:", clientSecret ? clientSecret.length : "MISSING");

  if (error) {
    redirectWithError(res, appUrl, error);
    return;
  }
  if (!clientId || !clientSecret) {
    res.status(500).send("Missing Todoist OAuth environment variables.");
    return;
  }
  if (!code || !state || !verifySignedState(state, clientSecret)) {
    console.log("DEBUG state verification failed. code exists:", Boolean(code), "state exists:", Boolean(state));
    redirectWithError(res, appUrl, "state_mismatch");
    return;
  }
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    });
    const response = await fetch(TODOIST_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      const text = await response.text();
      console.error("Todoist token exchange failed", response.status, text);
      redirectWithError(res, appUrl, "token_exchange_failed");
      return;
    }
    const payload = await response.json();
    const token = encodeURIComponent(payload.access_token);
    res.writeHead(302, { Location: `${appUrl}/#todoist_token=${token}` });
    res.end();
  } catch (err) {
    console.error(err);
    redirectWithError(res, appUrl, "server_error");
  }
}

function verifySignedState(state, secret) {
  const [encodedPayload, signature] = String(state).split(".");
  console.log("DEBUG encodedPayload exists:", Boolean(encodedPayload), "signature exists:", Boolean(signature));
  if (!encodedPayload || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  console.log("DEBUG signature match:", signature === expected);

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const valid = typeof payload.exp === "number" && Date.now() < payload.exp;
    console.log("DEBUG exp check - now:", Date.now(), "exp:", payload.exp, "valid:", valid);
    return valid;
  } catch (err) {
    console.log("DEBUG payload parse error:", err.message);
    return false;
  }
}

function redirectWithError(res, appUrl, error) {
  res.writeHead(302, { Location: `${appUrl}/#todoist_error=${encodeURIComponent(error)}` });
  res.end();
}
