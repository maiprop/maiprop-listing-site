import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repo = process.cwd();
const requireFromRepo = createRequire(path.join(repo, "package.json"));

// Run the same behavioral contract with native Node and, on Windows, real POSIX
// symlinks in WSL. The program and all archives live in disposable external temp
// directories; it loads the exact extractor resolved by Puppeteer's package.
const extractionContract = String.raw`
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const repoRequire = createRequire(path.join(process.argv[2], 'package.json'));
const browsersMain = repoRequire.resolve('@puppeteer/browsers');
const browserRequire = createRequire(browsersMain);
const extractorPath = browserRequire.resolve('extract-zip');
const extract = browserRequire('extract-zip');
assert.equal(typeof extract, 'function');
assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(extractorPath), 'package.json'))).name, '@maiprop/safe-extract-zip');
function zip(entries) {
  const locals = [], centrals = []; let offset = 0;
  for (const {name, data = '', mode = 0, dos = false} of entries) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const filename = Buffer.from(name); let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4);
    local.writeUInt32LE(crc,14); local.writeUInt32LE(bytes.length,18); local.writeUInt32LE(bytes.length,22); local.writeUInt16LE(filename.length,26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(dos ? 20 : 0x0314,4); central.writeUInt16LE(20,6);
    central.writeUInt32LE(crc,16); central.writeUInt32LE(bytes.length,20); central.writeUInt32LE(bytes.length,24); central.writeUInt16LE(filename.length,28);
    central.writeUInt32LE(dos ? 16 : (mode << 16) >>> 0,38); central.writeUInt32LE(offset,42);
    locals.push(local,filename,bytes); centrals.push(central,filename); offset += local.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'maiprop-extractor-contract-'));
let count = 0, skipped = 0;
async function scenario(name, entries, setup, check, reject = false, options = {}) {
  const base = path.join(temp,String(++count)); fs.mkdirSync(base);
  const root = path.join(base,'root'), outside = path.join(base,'outside'); fs.mkdirSync(root); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside,'sentinel'),'untouched');
  if (setup) setup(root,outside);
  const archive = path.join(base,'fixture.zip'); fs.writeFileSync(archive,zip(entries));
  if (reject) {
    let error; try { await extract(archive,{dir:root,...options}); } catch(e) { error=e; }
    assert.ok(error, name + ': must reject');
    assert.notEqual(error.code,'EPERM',name + ': privilege error is not containment');
    assert.notEqual(error.code,'EACCES',name + ': privilege error is not containment');
  } else await extract(archive,{dir:root,...options});
  assert.equal(fs.readFileSync(path.join(outside,'sentinel'),'utf8'),'untouched',name);
  if (check) check(root,outside);
  console.log('PASS '+name);
}
const link = (name,data) => ({name,data,mode:0o120777});
async function run() {
  for (const target of ['../outside','../../escape','/tmp/escape','C:/escape','C:\\escape','C:escape','\\\\server\\share','..\\outside','file:stream']) {
    await scenario('reject link target '+target,[link('escape',target)],null,root=>assert.equal(fs.existsSync(path.join(root,'escape')),false),true);
  }
  for (const name of ['../outside/sentinel','a/../../outside/sentinel','/escape','C:/escape','C:\\escape','\\\\server\\share\\file','file:stream','a\\..\\..\\outside\\sentinel']) {
    await scenario('reject entry '+name,[{name,data:'bad'}],null,null,true);
  }
  let callbacks = 0;
  await scenario('nested binary, ordinary overwrite, onEntry, executable and default modes',[
    {name:'nested/'},{name:'nested/data',data:Buffer.from([0,1,2,255])},
    {name:'existing',data:'replacement'},{name:'bin/tool',data:'executable',mode:0o100755},
    {name:'dos-directory',dos:true},{name:'__MACOSX/ignored',data:'skip'}
  ],root=>fs.writeFileSync(path.join(root,'existing'),'old'),root=>{
    assert.deepEqual(fs.readFileSync(path.join(root,'nested/data')),Buffer.from([0,1,2,255]));
    assert.equal(fs.readFileSync(path.join(root,'existing'),'utf8'),'replacement');
    assert.ok(fs.statSync(path.join(root,'dos-directory')).isDirectory());
    assert.equal(callbacks,5); assert.equal(fs.existsSync(path.join(root,'__MACOSX')),false);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(path.join(root,'bin/tool')).mode & 0o777,0o755 & ~process.umask());
      assert.equal(fs.statSync(path.join(root,'nested/data')).mode & 0o777,0o640 & ~process.umask());
      assert.equal(fs.statSync(path.join(root,'nested')).mode & 0o777,0o750 & ~process.umask());
    }
  },false,{defaultFileMode:0o640,defaultDirMode:0o750,onEntry:()=>callbacks++});
  const malformed=path.join(temp,'malformed.zip'); fs.writeFileSync(malformed,'not a zip');
  await assert.rejects(extract(malformed,{dir:path.join(temp,'malformed')}));
  await assert.rejects(extract(malformed,{dir:'relative'}));
  const browserArchive=path.join(temp,'browser.zip'); fs.writeFileSync(browserArchive,zip([{name:'chrome/bin/chrome',data:'browser',mode:0o100755}]));
  const cjs = require(path.join(path.dirname(browsersMain),'fileUtil.js'));
  await cjs.unpackArchive(browserArchive,path.join(temp,'browser-cjs'));
  const esm = await import(pathToFileURL(path.join(path.dirname(browsersMain),'../esm/fileUtil.js')).href);
  await esm.unpackArchive(browserArchive,path.join(temp,'browser-esm'));
  for (const kind of ['cjs','esm']) assert.equal(fs.readFileSync(path.join(temp,'browser-'+kind,'chrome/bin/chrome'),'utf8'),'browser');
  console.log('PASS actual Puppeteer CJS and ESM unpackArchive');
  // Track only ZIP descriptors, not incidental output-file handles. Rejected
  // duplicates must release yauzl's reader even after repeated failures.
  const open = fs.open, close = fs.close, zipDescriptors = new Set();
  fs.open = function(file,...args) {
    const callback=args.pop();
    return open.call(fs,file,...args,(error,fd)=>{
      if (!error && String(file).endsWith('.zip')) zipDescriptors.add(fd);
      callback(error,fd);
    });
  };
  fs.close = function(fd,callback) {
    return close.call(fs,fd,error=>{if(!error)zipDescriptors.delete(fd);callback(error);});
  };
  try {
    for(let repeat=0;repeat<3;repeat++) {
      await scenario('file then symlink releases ZIP reader '+repeat,[{name:'same',data:'original'},link('same','target')],null,null,true);
      for(let wait=0;zipDescriptors.size && wait<100;wait++)await new Promise(resolve=>setTimeout(resolve,10));
      assert.equal(zipDescriptors.size,0,'Rejected archive leaked an open ZIP descriptor');
    }
  } finally {fs.open=open;fs.close=close;}
  let canSymlink = true;
  try { fs.symlinkSync('missing',path.join(temp,'probe')); }
  catch(e) { if(process.platform==='win32' && ['EPERM','EACCES'].includes(e.code)) canSymlink=false; else throw e; }
  if (!canSymlink) { skipped++; console.log('SKIP native Windows positive/existing-link cases: symlink privilege EPERM/EACCES; required POSIX contract runs in WSL'); return; }
  await scenario('contained forward link and executable browser layout',[
    link('bin/current','../lib/tool'),{name:'lib/tool',data:'works',mode:0o100755}
  ],null,root=>assert.equal(fs.readFileSync(path.join(root,'bin/current'),'utf8'),'works'));
  await scenario('contained dangling forward target',[link('future','missing/deep/file')],null,root=>assert.equal(fs.readlinkSync(path.join(root,'future')),'missing/deep/file'));
  await scenario('contained parent link', [{name:'alias/deep/file',data:'ok'}],root=>{fs.mkdirSync(path.join(root,'real'));fs.symlinkSync('real',path.join(root,'alias'));},root=>assert.equal(fs.readFileSync(path.join(root,'real/deep/file'),'utf8'),'ok'));
  await scenario('contained absolute filesystem parent link', [{name:'alias/deep/file',data:'ok'}],root=>{fs.mkdirSync(path.join(root,'real'));fs.symlinkSync(path.join(root,'real'),path.join(root,'alias'));},root=>assert.equal(fs.readFileSync(path.join(root,'real/deep/file'),'utf8'),'ok'));
  await scenario('duplicate symlink then file',[link('alias','target'),{name:'alias',data:'bad'}],null,root=>assert.equal(fs.existsSync(path.join(root,'target')),false),true);
  await scenario('pre-existing leaf outside link',[{name:'alias',data:'bad'}],(root,outside)=>fs.symlinkSync(path.join(outside,'sentinel'),path.join(root,'alias')),null,true);
  await scenario('pre-existing contained leaf link',[{name:'alias',data:'bad'}],root=>{fs.writeFileSync(path.join(root,'target'),'old');fs.symlinkSync('target',path.join(root,'alias'));},root=>assert.equal(fs.readFileSync(path.join(root,'target'),'utf8'),'old'),true);
  await scenario('pre-existing dangling leaf link',[{name:'alias',data:'bad'}],root=>fs.symlinkSync('missing',path.join(root,'alias')),root=>assert.equal(fs.existsSync(path.join(root,'missing')),false),true);
  await scenario('directory entry cannot follow leaf symlink',[{name:'alias/'}],(root,outside)=>fs.symlinkSync(outside,path.join(root,'alias')),null,true);
  await scenario('parent indirection before recursive mkdir',[{name:'alias/new/deep/file',data:'bad'}],(root,outside)=>fs.symlinkSync(outside,path.join(root,'alias')),(_root,outside)=>assert.equal(fs.existsSync(path.join(outside,'new')),false),true);
  await scenario('dangling outside parent before mkdir',[{name:'alias/new/deep/file',data:'bad'}],(root,outside)=>fs.symlinkSync(path.join(outside,'missing'),path.join(root,'alias')),(_root,outside)=>assert.equal(fs.existsSync(path.join(outside,'missing')),false),true);
  await scenario('deep existing ancestor',[{name:'deep/alias/new/deeper/file',data:'bad'}],(root,outside)=>{fs.mkdirSync(path.join(root,'deep'));fs.symlinkSync(outside,path.join(root,'deep/alias'));},(_root,outside)=>assert.equal(fs.existsSync(path.join(outside,'new')),false),true);
  await scenario('outside symlink target via existing parent',[link('newlink','alias/future')],(root,outside)=>fs.symlinkSync(outside,path.join(root,'alias')),null,true);
  await scenario('outside target via dangling existing link',[link('newlink','alias/future')],(root,outside)=>fs.symlinkSync(path.join(outside,'missing'),path.join(root,'alias')),null,true);
  await scenario('outside target via two link chain',[link('newlink','first/future')],(root,outside)=>{fs.symlinkSync('second',path.join(root,'first'));fs.symlinkSync(outside,path.join(root,'second'));},null,true);
  await scenario('contained symlink chain',[link('one','two'),link('two','real'),{name:'real/file',data:'ok'}],null,root=>assert.equal(fs.readFileSync(path.join(root,'one/file'),'utf8'),'ok'));
  await scenario('symlink plus dotdot must use canonical parent',[link('newlink','alias/../../outside')],root=>{fs.mkdirSync(path.join(root,'real'));fs.symlinkSync('real',path.join(root,'alias'));},null,true);
  await scenario('symlink then dotdot remains contained',[link('newlink','alias/../future')],root=>{fs.mkdirSync(path.join(root,'real'));fs.symlinkSync('real',path.join(root,'alias'));},root=>assert.equal(fs.readlinkSync(path.join(root,'newlink')),'alias/../future'));
  await scenario('forward link cannot later retarget dotdot outside',[link('one','two/../outside'),link('two','.')],null,root=>{
    // Rejecting after leaving both links would still leave an escaping target.
    const one=path.join(root,'one'),two=path.join(root,'two');
    assert.ok(!fs.existsSync(two) || !fs.lstatSync(one,{throwIfNoEntry:false}));
  },true);
  await scenario('cycle in existing link chain',[link('newlink','one/file')],root=>{fs.symlinkSync('two',path.join(root,'one'));fs.symlinkSync('one',path.join(root,'two'));},null,true);
  await scenario('non-directory parent is an error',[{name:'plain/deeper/file',data:'bad'}],root=>fs.writeFileSync(path.join(root,'plain'),'file'),null,true);
  await scenario('revalidate after onEntry',[{name:'leaf',data:'bad'}],null,null,true,{onEntry:()=>{
    // onEntry receives archive metadata; find this scenario's canonical root.
    const root=path.join(temp,String(count),'root');fs.symlinkSync('../outside/sentinel',path.join(root,'leaf'));
  }});
  const linksArchive=path.join(temp,'links-browser.zip');fs.writeFileSync(linksArchive,zip([link('chrome/current','bin/chrome'),{name:'chrome/bin/chrome',data:'browser',mode:0o100755}]));
  await cjs.unpackArchive(linksArchive,path.join(temp,'links-browser'));
  assert.equal(fs.readFileSync(path.join(temp,'links-browser/chrome/current'),'utf8'),'browser');
  console.log('PASS actual Puppeteer archive with contained symlink');
}
run().then(()=>console.log(JSON.stringify({cases:count,skipped,extractorPath,platform:process.platform}))).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
`;

function runContract(wsl: boolean) {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "maiprop-contract-runner-"));
  try {
    const script = path.join(fixture, "contract.cjs");
    writeFileSync(script, extractionContract);
    const linuxPath = (input: string) => `/mnt/${input[0].toLowerCase()}/${input.slice(3).replaceAll("\\", "/")}`;
    const child = wsl
      ? spawnSync("C:\\Windows\\System32\\wsl.exe", ["--exec", "timeout", "12", "node", linuxPath(script), linuxPath(repo)], { encoding: "utf8", timeout: 14_000 })
      : spawnSync(process.execPath, [script, repo], { encoding: "utf8", timeout: 12_000 });
    expect(child.error, `${child.stdout}\n${child.stderr}`).toBeUndefined();
    expect(child.status, `${child.stdout}\n${child.stderr}`).toBe(0);
    console.info(child.stdout.trim());
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe("targeted dependency security", () => {
  it("enforces extraction containment through the exact Puppeteer resolution", () => runContract(false));

  // Windows commonly lacks symlink privilege. POSIX is exercised through WSL
  // when available; Linux/macOS run those cases in the native contract above.
  const wslAvailable = process.platform === "win32" && spawnSync("C:\\Windows\\System32\\wsl.exe", ["--exec", "timeout", "5", "node", "--version"], { encoding: "utf8", timeout: 7_000 }).status === 0;
  it.skipIf(!wslAvailable)("runs genuine POSIX symlink attacks and browser controls in WSL", () => runContract(true));

  it("locks and installs only patched sharp copies including Miniflare's resolution", async () => {
    const lock = JSON.parse(readFileSync(path.join(repo, "package-lock.json"), "utf8"));
    const entries = Object.entries(lock.packages as Record<string, { version?: string }>).filter(([name]) => /(?:^|\/)node_modules\/sharp$/.test(name));
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, metadata] of entries) {
      const [major, minor, patch] = String(metadata.version).split(".").map(Number);
      expect(major > 0 || minor > 35 || (minor === 35 && patch >= 5), name).toBe(true);
      const installed = JSON.parse(readFileSync(path.join(repo, name, "package.json"), "utf8"));
      expect(installed.version).toBe(metadata.version);
    }
    const installedSharp: string[] = [];
    function inspectModules(modules: string) {
      if (!existsSync(modules)) return;
      for (const entry of readdirSync(modules, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const packagePaths = entry.name.startsWith("@")
          ? readdirSync(path.join(modules, entry.name)).map((name) => path.join(modules, entry.name, name))
          : [path.join(modules, entry.name)];
        for (const packagePath of packagePaths) {
          if (path.basename(packagePath) === "sharp") installedSharp.push(packagePath);
          inspectModules(path.join(packagePath, "node_modules"));
        }
      }
    }
    inspectModules(path.join(repo, "node_modules"));
    expect(installedSharp.length).toBe(entries.length);
    for (const packagePath of installedSharp) {
      const { version } = JSON.parse(readFileSync(path.join(packagePath, "package.json"), "utf8"));
      const [major, minor, patch] = String(version).split(".").map(Number);
      expect(major > 0 || minor > 35 || (minor === 35 && patch >= 5), packagePath).toBe(true);
    }
    const miniflareRequire = createRequire(requireFromRepo.resolve("miniflare"));
    const sharp = miniflareRequire("sharp") as typeof import("sharp");
    expect(entries.some(([, metadata]) => metadata.version === sharp.versions.sharp)).toBe(true);
    const converted = await sharp({ create: { width: 2, height: 3, channels: 4, background: { r: 12, g: 34, b: 56, alpha: 1 } } }).png().toBuffer();
    expect((await sharp(converted).metadata()).format).toBe("png");
    expect((await sharp(converted).metadata()).width).toBe(2);
  });

  it("replaces every lockfile extractor with the local reviewed package", () => {
    const lock = JSON.parse(readFileSync(path.join(repo, "package-lock.json"), "utf8"));
    const entries = Object.entries(lock.packages as Record<string, { link?: boolean; resolved?: string; name?: string; version?: string }>).filter(([name]) => /(?:^|\/)node_modules\/extract-zip$/.test(name));
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, metadata] of entries) {
      const installed = JSON.parse(readFileSync(path.join(repo, name, "package.json"), "utf8"));
      expect(installed.name).toBe("@maiprop/safe-extract-zip");
      expect(installed.version).toBe("2.0.1-maiprop.1");
      expect(metadata.resolved?.replaceAll("\\", "/")).toMatch(/(?:^|\/)vendor\/safe-extract-zip$/);
    }
  });
});
