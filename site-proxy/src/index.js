// SatuQR site proxy: serves the static Pages site under satuqr.aufa.eu.cc.
// The Pages API rejects custom domains on this account (error 8000015 for
// both eu.cc and ai.id hostnames), so this Worker reverse-proxies the Pages
// origin instead. Static only: GET/HEAD pass through, everything else 405.
const ORIGIN = "https://satuqr.pages.dev";

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    const url = new URL(request.url);
    const res = await fetch(ORIGIN + url.pathname + url.search, {
      method: request.method,
      redirect: "manual",
    });
    return new Response(res.body, { status: res.status, headers: res.headers });
  },
};
