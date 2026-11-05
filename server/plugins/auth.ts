import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

// When GitHub OAuth is configured (the hosted deploy), Docket signs in with
// GitHub only: with no email provider there, email/password sign-up is refused
// server-side, so the page offers one door. Without it (local, the VM), the
// toolkit's email/password page stays.
const GITHUB_LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<title>Docket</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
<style>
  :root { color-scheme: light dark; --fg:#111; --bg:#fff; --muted:#6b6b6b; --line:#e5e5e5; }
  @media (prefers-color-scheme: dark) { :root { --fg:#ededed; --bg:#1a1a1a; --muted:#9a9a9a; --line:#2e2e2e; } }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; background: var(--bg); color: var(--fg);
    font: 15px/1.4 "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: min(320px, 88vw); display: grid; gap: 20px; text-align: center; }
  h1 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
  button { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%;
    height: 44px; border: 1px solid var(--line); border-radius: 8px; background: var(--fg); color: var(--bg);
    font: inherit; font-weight: 500; cursor: pointer; }
  button[disabled] { opacity: .6; cursor: default; }
  #err { margin: 0; min-height: 1.4em; color: var(--muted); font-size: 13px; }
</style>
</head>
<body>
<main>
  <h1>Docket</h1>
  <button id="gh" type="button">
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
    <span>Continue with GitHub</span>
  </button>
  <p id="err" role="status"></p>
</main>
<script>
(function () {
  var btn = document.getElementById("gh");
  var err = document.getElementById("err");
  var params = new URLSearchParams(location.search);
  if (params.get("error")) err.textContent = "GitHub sign-in didn't finish. Try again.";
  // Return to the board the visitor opened; anything else lands on /court.
  var path = location.pathname;
  var back = /^\\/court(\\/[A-Za-z0-9_-]+)?$/.test(path) ? path : "/court";
  btn.addEventListener("click", function () {
    btn.disabled = true;
    err.textContent = "";
    fetch("/_agent-native/auth/ba/sign-in/social", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "github", callbackURL: back, errorCallbackURL: "/court?error=github" })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.url) { location.href = d.url; return; }
      throw new Error("no url");
    }).catch(function () {
      btn.disabled = false;
      err.textContent = "GitHub sign-in isn't available right now.";
    });
  });
})();
</script>
</body>
</html>`;

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  rootAuth: true,
  marketing: false,
  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? { loginHtml: GITHUB_LOGIN_HTML }
    : {}),
});
