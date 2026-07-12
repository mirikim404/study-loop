const TODOIST_TOKEN_URL = "https://todoist.com/oauth/access_token";

export default async function handler(req, res) {
  const clientId = process.env.TODOIST_CLIENT_ID;
  const clientSecret = process.env.TODOIST_CLIENT_SECRET;
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
  const { code, state, error } = req.query;

  if (error) {
    redirectWithError(res, appUrl, error);
    return;
  }

  if (!clientId || !clientSecret) {
    res.status(500).send("Missing Todoist OAuth environment variables.");
    return;
  }

  const savedState = parseCookie(req.headers.cookie || "").studyloop_oauth_state;
  if (!code || !state || !savedState || state !== savedState) {
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
    res.setHeader("Set-Cookie", "studyloop_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
    res.writeHead(302, { Location: `${appUrl}/#todoist_token=${token}` });
    res.end();
  } catch (err) {
    console.error(err);
    redirectWithError(res, appUrl, "server_error");
  }
}

function parseCookie(cookieHeader) {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function redirectWithError(res, appUrl, error) {
  res.setHeader("Set-Cookie", "studyloop_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  res.writeHead(302, { Location: `${appUrl}/#todoist_error=${encodeURIComponent(error)}` });
  res.end();
}
