const PROTECTED_PATHS = ["/dashboard", "/admin", "/platform-map"];

function isProtectedAudit(url) {
  try {
    const { pathname } = new URL(url);
    return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  } catch {
    return false;
  }
}

module.exports = async (browser, context) => {
  if (!isProtectedAudit(context.url)) return;

  const pathname = new URL(context.url).pathname;
  const needsAdmin = pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/platform-map";
  const email = needsAdmin
    ? process.env.LIGHTHOUSE_ADMIN_EMAIL
    : process.env.LIGHTHOUSE_AUTH_EMAIL;
  const password = needsAdmin
    ? process.env.LIGHTHOUSE_ADMIN_PASSWORD
    : process.env.LIGHTHOUSE_AUTH_PASSWORD;
  if (!email || !password) {
    throw new Error(
      `Lighthouse authenticated audit for ${context.url} requires ${needsAdmin ? "LIGHTHOUSE_ADMIN_EMAIL/LIGHTHOUSE_ADMIN_PASSWORD" : "LIGHTHOUSE_AUTH_EMAIL/LIGHTHOUSE_AUTH_PASSWORD"}.`,
    );
  }

  const target = new URL(context.url);
  const page = await browser.newPage();
  await page.goto(target.origin, { waitUntil: "domcontentloaded" });
  const cookies = await page.cookies();
  if (cookies.length) {
    await page.deleteCookie(...cookies);
  }
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${target.origin}/login`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#login-email, input[type='email'], input[name='email']", { timeout: 30_000 });
  await page.type("#login-email, input[type='email'], input[name='email']", email);
  await page.type("#login-password, input[type='password'], input[name='password']", password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30_000 }).catch(() => undefined),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(context.url, { waitUntil: "networkidle0" });
  await page.close();
};
