import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { auctionTargets, auctionHttp } from "./auction-recovery-pages.mjs";
import { validateAuctionFixtureState } from "./auction-recovery-fixtures.mjs";
import { getSiteLockPlaywrightCookie } from "./check-production-deploy-site-lock.mjs";

const e=process.env, target=auctionTargets[e.TARGET_KIND];
assert(target && e.TARGET_PROJECT_REF===target.ref,"Smoke target mismatch");
for(let attempt=0;;attempt++) {
  try { execFileSync(process.execPath,["scripts/verify-live-release-marker.mjs",target.origin,`${e.AUCTION_ARTIFACT}/release-manifest.json`],{stdio:["ignore","pipe","pipe"]});break; }
  catch {if(attempt===5)throw Error("Auction live marker did not converge within the bounded propagation window");await new Promise(r=>setTimeout(r,5000));}
}
const scope=await (await auctionHttp(`${target.origin}/auction-recovery.json`)).json();
assert.deepEqual(scope,JSON.parse(readFileSync(`${e.AUCTION_ARTIFACT}/dist/auction-recovery.json`,"utf8")));
const timings=[];
async function auctions(query="",token) {
  const start=performance.now();
  const params=new URLSearchParams({limit:"600",page:"1",pageSize:"24"});
  for(const [key,value] of new URLSearchParams(query.replace(/^&/,""))) params.set(key,value);
  const response=await auctionHttp(`${target.origin}/api/public/auctions?${params}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
  const body=await response.json(); timings.push({duration_ms:Math.round(performance.now()-start),cache:response.headers.get("x-public-cache")});
  assert(Array.isArray(body.data) && body.data.length>0,"Auctions must be populated");
  assert(body.data.every(row=>row.listing_id && row.title && row.listing_type==="auction"),"Auction cards must have canonical action IDs");
  return body;
}
let state, freeSession;
const login=async user=>(await auctionHttp(`https://${target.ref}.supabase.co/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:e.AUCTION_STAGING_ANON_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:user.email,password:user.password})})).json();
const first=await auctions(); assert(first.total<=60,"Anonymous limit exceeds 60");
await auctions();
const second=await auctions("&page=2");
assert.equal(second.page,2); assert(second.data.every(r=>!first.data.some(f=>f.listing_id===r.listing_id)),"Pagination repeated first page");
const city=first.data[0].city; const filtered=await auctions(`&city=${encodeURIComponent(city)}`);
assert(filtered.data.every(r=>r.city===city),"City filter leaked another city");
const firstRow=first.data[0];
for(const identity of [`ids=${firstRow.listing_id}`,`osTag=${encodeURIComponent(firstRow.id)}`]) {
  const exact=await auctions(`&${identity}`); assert.equal(exact.data.length,1); assert.equal(exact.data[0].listing_id,firstRow.listing_id);
}
if(e.TARGET_KIND==="staging") {
  state=validateAuctionFixtureState(JSON.parse(readFileSync(`${e.RUNNER_TEMP}/auction-fixtures.json`,"utf8")),e.GITHUB_RUN_ID);
  const sessions=await Promise.all(state.users.map(login)); freeSession=sessions[0];
  for(let i=0;i<2;i++) {
    const body=await auctions(`&city=AuctionProof${e.GITHUB_RUN_ID}`,sessions[i].access_token);
    assert.equal(body.total,i===0?60:600,`${state.users[i].tier} visibility cap`);
  }
  assert.equal(first.total,60);
  const denied=await fetch(`https://${target.ref}.supabase.co/rest/v1/rpc/get_public_auction_candidates`,{method:"POST",redirect:"error",signal:AbortSignal.timeout(30_000),headers:{apikey:e.AUCTION_STAGING_ANON_KEY,"Content-Type":"application/json"},body:"{}"});
  assert([401,403,404].includes(denied.status),"Internal auction reader is publicly callable");
}
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({locale:"en-US",viewport:{width:1440,height:1000}});
  if(e.SITE_LOCK_PASSWORD) await context.addCookies([await getSiteLockPlaywrightCookie(target.origin,e.SITE_LOCK_PASSWORD)]);
  // Access headers are sent only to the fixed Pages origin, never third-party resources.
  if(e.CF_ACCESS_CLIENT_ID && e.CF_ACCESS_CLIENT_SECRET) await context.route(`${target.origin}/**`,route=>route.continue({headers:{...route.request().headers(),"CF-Access-Client-Id":e.CF_ACCESS_CLIENT_ID,"CF-Access-Client-Secret":e.CF_ACCESS_CLIENT_SECRET}}));
  await context.addInitScript(({session,ref})=>{localStorage.setItem("i18nextLng","en");if(session)localStorage.setItem(`sb-${ref}-auth-token`,JSON.stringify(session));},{session:freeSession,ref:target.ref});
  const page=await context.newPage(); const errors=[];page.on("pageerror",error=>errors.push(error.message));
  const favoritesReady=state?page.waitForResponse(r=>r.url().startsWith(`https://${target.ref}.supabase.co/rest/v1/favorites`) && r.request().method()==="GET" && r.ok(),{timeout:45_000}):null;
  const start=performance.now();await page.goto(`${target.origin}/auctions${state?`?city=AuctionProof${e.GITHUB_RUN_ID}`:""}`,{waitUntil:"domcontentloaded"});
  const card=page.getByTestId("auction-card").first();await card.waitFor({state:"visible",timeout:45_000});
  const renderMs=Math.round(performance.now()-start);
  if(state) {
    await favoritesReady;
    const owned=state.listings[0], provider=`recovery-${e.GITHUB_RUN_ID}-1`;
    const ownCard=page.getByTestId("auction-card").filter({has:page.locator(`a[href="/auction/${provider}"]`)}).first();
    await ownCard.waitFor({state:"visible",timeout:30_000});
    const rest=`https://${target.ref}.supabase.co/rest/v1`;
    const userHeaders={apikey:e.AUCTION_STAGING_ANON_KEY,Authorization:`Bearer ${freeSession.access_token}`};
    const selectFavorites=async()=> (await auctionHttp(`${rest}/favorites?user_id=eq.${state.users[0].id}&listing_id=eq.${owned}&select=listing_id`,{headers:userHeaders})).json();
    const saveResponse=page.waitForResponse(r=>r.url().startsWith(`${rest}/favorites`) && r.request().method()==="POST");
    await ownCard.getByRole("button",{name:"Save",exact:true}).click(); assert((await saveResponse).ok());assert.equal((await selectFavorites()).length,1);
    const removeResponse=page.waitForResponse(r=>r.url().startsWith(`${rest}/favorites`) && r.request().method()==="DELETE");
    await ownCard.getByRole("button",{name:/Remove.*saved/i}).click();assert((await removeResponse).ok());assert.equal((await selectFavorites()).length,0);
    const reportResponse=page.waitForResponse(r=>r.url().startsWith(`${rest}/listing_reports`) && r.request().method()==="POST");
    await ownCard.getByRole("button",{name:/Report/i}).click();assert((await reportResponse).ok());
    // Service access is restricted to the isolated staging project and this new account's report.
    const report=await (await auctionHttp(`${rest}/listing_reports?reporter_id=eq.${state.users[0].id}&entity_id=eq.${owned}&select=entity_id`,{headers:{apikey:e.AUCTION_STAGING_SERVICE_KEY,Authorization:`Bearer ${e.AUCTION_STAGING_SERVICE_KEY}`}})).json();assert.equal(report.length,1);
  }
  const href=await card.locator('a[href^="/auction/"]').first().getAttribute("href");assert(href);
  const title=state?"Auction recovery property 1":firstRow.title;
  await card.locator('a[href^="/auction/"]').first().click();await page.waitForURL(`${target.origin}${href}`,{timeout:30_000});
  await page.getByRole("heading",{name:title,exact:true}).first().waitFor({state:"visible",timeout:30_000});
  const routeIds=state?[state.listings[0],`recovery-${e.GITHUB_RUN_ID}-1`]:[firstRow.listing_id,firstRow.id];
  for(const id of routeIds) {
    await page.goto(`${target.origin}/auction/${encodeURIComponent(id)}`,{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:title,exact:true}).first().waitFor({state:"visible",timeout:30_000});
  }
  assert.equal(errors.length,0,`Auction browser runtime errors: ${errors.length}`);
  writeFileSync(`auction-evidence/${e.TARGET_KIND}/smoke.json`,JSON.stringify({release_sha:e.RELEASE_SHA,run_id:e.GITHUB_RUN_ID,scope:"auctions",anonymous_total:first.total,first_page_count:first.data.length,pagination:true,city_filter:true,uuid_and_provider_details:true,authenticated_actions:e.TARGET_KIND==="staging",free_limit:state?60:null,paid_limit:state?600:null,render_ms:renderMs,samples:timings},null,2)+"\n");
} finally {await browser.close();}
