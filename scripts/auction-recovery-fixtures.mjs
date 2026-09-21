import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertStagingMutationTarget } from "./assert-staging-mutation-target.mjs";
import { auctionHttp } from "./auction-recovery-pages.mjs";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function validateAuctionFixtureState(s, runId) {
  if (!/^[1-9][0-9]*$/.test(runId) || s?.run_id !== runId || s.tag !== `auction-recovery:${runId}` || !Array.isArray(s.listings) || s.listings.length !== 650 || new Set(s.listings).size !== 650 || !s.listings.every(id=>uuid.test(id)) || !Array.isArray(s.users) || s.users.length > 2 || !s.users.every(u=>uuid.test(u.id) && ["free","paid"].includes(u.tier) && u.email === `auction-${runId}-${u.tier}@maiprop.demo`)) throw Error("Invalid run-owned auction fixture state");
  return s;
}
export function auctionFixtureSql(s, action) {
  validateAuctionFixtureState(s,s.run_id);
  const ids = s.listings.map(id=>`'${id}'::uuid`).join(",");
  const users = s.users.map(u=>`'${u.id}'::uuid`).join(",") || "NULL::uuid";
  const publish = `
 DO $publish$ DECLARE prior_minute timestamptz; publication bigint; amount integer; BEGIN
 SELECT snapshot_minute INTO prior_minute FROM public.get_public_catalogue_publication(NULL);
 IF prior_minute=date_trunc('minute',clock_timestamp()) THEN
   PERFORM pg_sleep(least(greatest(extract(epoch FROM prior_minute+interval '60.25 seconds'-clock_timestamp()),0),60.25));
 END IF;
 SELECT publication_id INTO publication FROM private.publish_public_catalogue();
 SELECT count(*) INTO amount FROM unnest(ARRAY[${ids}]) f(id)
 CROSS JOIN LATERAL public.get_public_catalogue_listing(publication,f.id,NULL::text) p;
 IF amount<>${action === "seed" ? 650 : 0} THEN RAISE EXCEPTION 'auction_fixture_publication_mismatch'; END IF;
 END $publish$;`;
  if(action==="cleanup") return `BEGIN; SET LOCAL statement_timeout='120s'; SELECT pg_advisory_xact_lock(hashtextextended('private.publish_public_catalogue',0));
 DELETE FROM public.listing_reports WHERE reporter_id IN (${users}) AND entity_id IN (${ids});
 DELETE FROM public.favorites WHERE user_id IN (${users}) AND listing_id IN (${ids});
 DELETE FROM public.listing_images WHERE listing_id IN (SELECT id FROM public.listings WHERE id IN (${ids}) AND tags @> ARRAY['${s.tag}']);
 DELETE FROM public.listings WHERE id IN (${ids}) AND tags @> ARRAY['${s.tag}'];
 ${publish} COMMIT;`;
  if(action!=="seed" || s.users.length!==2) throw Error("Auction seed requires exactly two new accounts");
  return `BEGIN; SET LOCAL app.ecas_load_test='true'; SET LOCAL statement_timeout='120s';
 SELECT pg_advisory_xact_lock(hashtextextended('private.publish_public_catalogue',0));
 ${s.users.map(u=>`SELECT public.complete_onboarding_role_for_user('${u.id}'::uuid,'buyer'::public.user_role,'buyer','Auction recovery ${u.tier}',NULL,NULL);
 UPDATE public.profiles SET force_pro_access=${u.tier==="paid"} WHERE user_id='${u.id}'::uuid;`).join("\n")}
 INSERT INTO public.listings (id,owner_id,title,description,address,city,region,postal_code,latitude,longitude,price,price_per_sqm,sqm,bedrooms,bathrooms,floor,total_floors,year_built,energy_class,property_type,listing_type,status,auction_date,auction_starting_bid,auction_court,website_url,tags,created_at,updated_at,is_off_market)
 SELECT id,NULL,'Auction recovery property '||n,'Temporary isolated staging auction','1 Recovery Avenue','AuctionProof${s.run_id}','Attica','10557',37.98,23.72,125000,1250,100,2,1,2,5,2005,'B','apartment','auction','active',(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+n*interval '1 millisecond',100000,'Athens Court','https://example.invalid/auction-recovery',ARRAY['source:maiprop-os','os_auction:recovery-${s.run_id}-'||n,'${s.tag}','auction_pool:'||to_char((now() AT TIME ZONE 'UTC')::date,'YYYY-MM-DD'),'round:1','ownership:full'],date_trunc('minute',now())-interval '1 minute',now(),false
 FROM unnest(ARRAY[${ids}]) WITH ORDINALITY f(id,n);
 ${publish} COMMIT;`;
}
async function main() {
  const e=process.env; const action=process.argv[2];
  if(e.TARGET_KIND!=="staging") throw Error("Auction fixtures are staging-only");
  assertStagingMutationTarget({projectRef:e.TARGET_PROJECT_REF,databaseUrl:e.TARGET_DB_URL,acknowledgement:e.STAGING_MUTATION_ACKNOWLEDGEMENT,ephemeralRole:e.TARGET_DB_EPHEMERAL_ROLE});
  const file=`${e.RUNNER_TEMP}/auction-fixtures.json`;
  const api="https://xsiehskfgeoqyazcgauv.supabase.co";
  const headers={apikey:e.AUCTION_STAGING_SERVICE_KEY,Authorization:`Bearer ${e.AUCTION_STAGING_SERVICE_KEY}`,"Content-Type":"application/json"};
  const save=s=>writeFileSync(file,JSON.stringify(s),{mode:0o600});
  let state;
  if(action==="seed") {
    if(existsSync(file)) throw Error("Auction fixture state already exists; refusing adoption");
    state={run_id:e.GITHUB_RUN_ID,tag:`auction-recovery:${e.GITHUB_RUN_ID}`,listings:Array.from({length:650},()=>randomUUID()),users:[]};
    validateAuctionFixtureState(state,e.GITHUB_RUN_ID); save(state);
    for(const tier of ["free","paid"]) {
      const email=`auction-${e.GITHUB_RUN_ID}-${tier}@maiprop.demo`, password=randomBytes(24).toString("base64url");
      const response=await auctionHttp(`${api}/auth/v1/admin/users`,{method:"POST",headers,body:JSON.stringify({email,password,email_confirm:true,app_metadata:{auction_recovery_run:e.GITHUB_RUN_ID},user_metadata:{first_name:"Auction",last_name:"Recovery"}})});
      const user=await response.json(); if(!uuid.test(user.id)) throw Error("Fixture account creation did not return an ID");
      state.users.push({id:user.id,tier,email,password}); save(state);
    }
  } else if(action==="cleanup") {
    if(!existsSync(file)) return;
    state=validateAuctionFixtureState(JSON.parse(readFileSync(file,"utf8")),e.GITHUB_RUN_ID);
  } else throw Error("Unknown auction fixture action");
  const run=spawnSync("psql",[e.TARGET_DB_URL,"--no-psqlrc","--set","ON_ERROR_STOP=1","-qAt"],{input:`SET ROLE postgres;\n${auctionFixtureSql(state,action)}`,encoding:"utf8",maxBuffer:1024*1024});
  if(run.status!==0) { console.error(run.stderr); throw Error(`Auction fixture ${action} failed`); }
  if(action==="cleanup") {
    for(const user of state.users) {
      const current=await (await auctionHttp(`${api}/auth/v1/admin/users/${user.id}`,{headers})).json();
      if(current.email!==user.email || current.app_metadata?.auction_recovery_run!==e.GITHUB_RUN_ID) throw Error("Refusing cleanup of an account not created by this run");
      // Revoke the newly created account's sessions before removing it.
      const login=await (await auctionHttp(`${api}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:e.AUCTION_STAGING_ANON_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:user.email,password:user.password})})).json();
      await auctionHttp(`${api}/auth/v1/logout?scope=global`,{method:"POST",headers:{apikey:e.AUCTION_STAGING_ANON_KEY,Authorization:`Bearer ${login.access_token}`}});
      await auctionHttp(`${api}/auth/v1/admin/users/${user.id}`,{method:"DELETE",headers});
    }
    writeFileSync("auction-evidence/staging/fixture-cleanup.json",JSON.stringify({run_id:e.GITHUB_RUN_ID,listings_removed:650,accounts_removed:state.users.length})+"\n");
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main();
