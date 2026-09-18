"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const {spawn, spawnSync} = require("node:child_process");
const {once} = require("node:events");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const root = path.resolve(__dirname, "..");
let checks=0;
function check(name, fn){fn();checks++;console.log("PASS "+name);}
async function start(extra={}){
  const socket=net.createServer().listen(0,"127.0.0.1");await once(socket,"listening");
  const port=socket.address().port;await new Promise(r=>socket.close(r));
  const dir=extra.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(),"amigo-security-"));
  const child=spawn(process.execPath,[path.join(root,"server.js")],{cwd:root,env:{...process.env,NODE_ENV:"test",HOST:"127.0.0.1",PORT:String(port),APP_ORIGIN:"http://127.0.0.1:"+port,DATA_DIR:dir,TRUST_PROXY:"",...extra},stdio:["ignore","pipe","pipe"]});
  let out="";child.stdout.on("data",b=>out+=b);child.stderr.on("data",b=>out+=b);
  const base="http://127.0.0.1:"+port;
  for(let i=0;i<100;i++){
    if(child.exitCode!==null) throw new Error("Server exited: "+out);
    try{await fetch(base);return {child,base,dir,getOutput:()=>out}}catch{await new Promise(r=>setTimeout(r,100))}
  }
  child.kill();throw new Error("Startup timed out: "+out);
}
async function stop(server){if(server.child.exitCode!==null)return;const done=once(server.child,"exit");server.child.kill();await done;}
class Client{
  constructor(base){this.base=base;this.cookies=new Map();this.csrf="";}
  cookie(){return [...this.cookies].map(([k,v])=>k+"="+v).join("; ");}
  async req(route,method="GET",body,headers={},raw=false){
    const res=await fetch(this.base+route,{method,headers:{Cookie:this.cookie(),...(method!=="GET"?{"Content-Type":"application/json","X-CSRF-Token":this.csrf}:{}),...headers},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
    const cookieHeaders=res.headers.getSetCookie();
    cookieHeaders.forEach(c=>{const item=c.split(";")[0],at=item.indexOf("="),name=item.slice(0,at),value=item.slice(at+1);if(value)this.cookies.set(name,value);else this.cookies.delete(name);});
    const text=await res.text();let data;try{data=JSON.parse(text)}catch{data=text}
    if(data?.csrfToken)this.csrf=data.csrfToken;
    return {status:res.status,headers:res.headers,data,text,cookieHeaders};
  }
}
async function main(){
  const server=await start();
  let prod;
  try{
    const a=new Client(server.base),b=new Client(server.base);
    const page=await a.req("/");
    check("homepage and locally hosted replacement image",()=>{assert.equal(page.status,200);assert.match(page.text,/assets\/login-collage.webp/);assert.doesNotMatch(page.text,/fonts.googleapis.com/);});
    const img=await fetch(server.base+"/assets/login-collage.webp");
    // Compare actual served bytes to the checked-in image, not just a successful status.
    const served=Buffer.from(await img.arrayBuffer());
    check("replacement image matches supplied source SHA-256",()=>assert.equal(crypto.createHash("sha256").update(served).digest("hex"),"76b242e16492f563c762e8db9f30c462ae543dfa1292b137aab4d1cea1739adf"));
    check("served image matches disk",()=>{assert.equal(img.status,200);assert.deepEqual(served,fs.readFileSync(path.join(root,"public/assets/login-collage.webp")));});
    check("CSP, anti-framing, no-sniff and no framework fingerprint",()=>{assert.match(page.headers.get("content-security-policy"),/frame-ancestors 'none'/);assert.match(page.headers.get("content-security-policy"),/script-src 'self'/);assert.equal(page.headers.get("x-content-type-options"),"nosniff");assert.equal(page.headers.get("x-frame-options"),"DENY");assert.equal(page.headers.get("x-powered-by"),null);});
    for(const route of ["/passwords","/data/passwords","/data/amigo.db","/.env","/server.js","/.upgrade/original-hashes.json","/api/not-real"]){
      const response=await a.req(route);check("private or unknown path blocked: "+route,()=>assert.equal(response.status,404));
    }
    const anonymousProfile=await a.req("/api/me");
    check("anonymous profile blocked",()=>assert.equal(anonymousProfile.status,401));
    const csrf=await a.req("/api/csrf");
    check("HTTP-only SameSite cookie and no-store API",()=>{assert.match(csrf.cookieHeaders.join(";"),/HttpOnly/);assert.match(csrf.cookieHeaders.join(";"),/SameSite=Strict/);assert.equal(csrf.headers.get("cache-control"),"no-store");assert.equal(csrf.data.csrfToken.length,64);});
    const password="Fixture-only River Moon 42!";
    const email="member@example.test";
    let r=await a.req("/api/register","POST",{name:"Member One",email,password},{"X-CSRF-Token":""});
    check("missing CSRF blocked",()=>assert.equal(r.status,403));
    r=await a.req("/api/register","POST",{name:"Member One",email,password},{Origin:"https://foreign.example"});
    check("foreign Origin blocked",()=>assert.equal(r.status,403));
    r=await a.req("/api/register","POST",{name:"Member One",email,password},{"Sec-Fetch-Site":"cross-site"});
    check("cross-site Fetch Metadata blocked",()=>assert.equal(r.status,403));
    r=await a.req("/api/register","POST",{name:"Member One",email,password:"short"});
    check("weak password rejected",()=>assert.equal(r.status,400));
    r=await a.req("/api/register","POST",{name:"Member One",email,password:"أ".repeat(37)});
    check("bcrypt UTF-8 byte limit enforced",()=>assert.equal(r.status,400));
    r=await a.req("/api/register","POST",{name:{bad:true},email,password});
    check("input types validated",()=>assert.equal(r.status,400));
    const anonymousCookie=a.cookie(),anonymousCsrf=a.csrf;
    r=await a.req("/api/register","POST",{name:"Member One",email,password});
    const user1=r.data.user;
    check("signup rotates anonymous session and CSRF",()=>{assert.equal(r.status,201);assert.notEqual(a.cookie(),anonymousCookie);assert.notEqual(a.csrf,anonymousCsrf);assert.equal(user1.email,email);assert.equal("password_hash" in user1,false);});
    const stored=new Database(path.join(server.dir,"amigo.db"));
    const hash=stored.prepare("SELECT password_hash FROM users WHERE email=?").get(email).password_hash;
    check("password stored as bcrypt cost 12",()=>{assert.match(hash,/^\$2[aby]\$12\$/);assert.equal(bcrypt.compareSync(password,hash),true);assert.notEqual(hash,password);});
    r=await a.req("/api/posts","POST",{body:"x"},{"X-CSRF-Token":anonymousCsrf});
    check("old CSRF rejected after session rotation",()=>assert.equal(r.status,403));
    const sessionToken=a.cookies.get("amigo_session");
    check("session token stored only as a SHA-256 digest",()=>{const rows=stored.prepare("SELECT * FROM amigo_sessions").all();assert.equal(JSON.stringify(rows).includes(sessionToken),false);assert.ok(rows.some(row=>row.token_hash===crypto.createHash("sha256").update(sessionToken).digest("hex")));});
    await b.req("/api/csrf");
    r=await a.req("/api/posts","POST",{body:"cross-session token"},{"X-CSRF-Token":b.csrf});
    check("CSRF token is bound to its own session",()=>assert.equal(r.status,403));
    r=await b.req("/api/register","POST",{name:"<img src=x onerror=alert(1)>",email:"second@example.test",password});
    check("second account and independent salts",()=>{assert.equal(r.status,201);const other=stored.prepare("SELECT password_hash FROM users WHERE email=?").get("second@example.test").password_hash;assert.notEqual(other,hash);assert.equal(bcrypt.compareSync(password,other),true);});
    const xss="<img src=x onerror=alert(1)> '); DROP TABLE users; --";
    r=await a.req("/api/posts","POST",{body:xss});const postId=r.data.post.id;
    check("post creation preserves text without SQL execution",()=>{assert.equal(r.status,201);assert.equal(r.data.post.body,xss);assert.equal(stored.prepare("SELECT count(*) AS n FROM users").get().n,2);});
    r=await b.req("/api/posts/"+postId,"DELETE",{});
    check("cross-user deletion denied",()=>assert.equal(r.status,403));
    r=await b.req("/api/posts/"+postId+"/like","POST",{});
    check("like works",()=>{assert.equal(r.status,200);assert.equal(r.data.post.likeCount,1);});
    r=await b.req("/api/posts/"+postId+"/like","POST",{});
    check("unlike works",()=>assert.equal(r.data.post.likeCount,0));
    r=await a.req("/api/posts","POST",{body:"x".repeat(2001)});
    check("post size validated",()=>assert.equal(r.status,400));
    r=await a.req("/api/posts","POST","{broken",{},true);
    check("malformed JSON produces controlled error",()=>{assert.equal(r.status,400);assert.doesNotMatch(r.text,/stack|SyntaxError/);});
    r=await a.req("/api/posts","POST",{body:"x".repeat(20000)});
    check("oversized body rejected",()=>assert.equal(r.status,413));
    r=await a.req("/api/posts","POST",'{"body":"x"}',{"Content-Type":"text/plain"},true);
    check("unsupported content type rejected",()=>assert.equal(r.status,415));
    r=await a.req("/api/posts/"+postId,"DELETE",{});
    check("owner can delete own post",()=>{assert.equal(r.status,200);assert.equal(stored.prepare("SELECT count(*) AS n FROM posts WHERE id=?").get(postId).n,0);});
    const oldCookie=a.cookie();
    r=await a.req("/api/logout","POST",{});
    check("logout succeeds",()=>assert.equal(r.status,200));
    r=await a.req("/api/me","GET",undefined,{Cookie:oldCookie});
    check("logout revokes copied session server-side",()=>assert.equal(r.status,401));
    await a.req("/api/csrf");
    const wrong="Wrong-fixture-only Secret 123!";
    r=await a.req("/api/login","POST",{email,password:wrong});
    const wrongReply=r;
    check("wrong password rejected",()=>assert.equal(r.status,401));
    r=await a.req("/api/login","POST",{email:"unknown@example.test",password:wrong});
    check("unknown account gets identical login failure",()=>{assert.equal(r.status,wrongReply.status);assert.deepEqual(r.data,wrongReply.data);});
    r=await a.req("/api/login","POST",{email,password});
    check("correct login succeeds without returning hash",()=>{assert.equal(r.status,200);assert.equal(r.data.user.email,email);assert.doesNotMatch(r.text,/password_hash|\$2[aby]\$/);});
    stored.prepare("UPDATE amigo_sessions SET last_seen=? WHERE token_hash=?").run(Date.now()-31*60*1000,crypto.createHash("sha256").update(a.cookies.get("amigo_session")).digest("hex"));
    r=await a.req("/api/me");
    check("idle session expires",()=>assert.equal(r.status,401));
    // Existing short-password accounts still work; stricter policy is for new registration only.
    stored.prepare("INSERT INTO users VALUES (?,?,?,?,?)").run("legacy-user","Legacy Member","legacy@example.test",bcrypt.hashSync("old123",12),Date.now());
    await a.req("/api/csrf");
    r=await a.req("/api/login","POST",{email:"legacy@example.test",password:"old123"});
    check("legacy bcrypt accounts remain compatible",()=>assert.equal(r.status,200));
    const audit=fs.readFileSync(path.join(server.dir,"passwords"),"utf8");
    const records=audit.trim().split("\n").map(line=>JSON.parse(line));
    check("private audit records successful and failed auth",()=>{assert.ok(records.some(x=>x.operation==="sign_up"&&x.result==="success"&&x.email===email));assert.ok(records.some(x=>x.operation==="login"&&x.result==="failure"&&x.email===email));assert.ok(records.some(x=>x.operation==="login"&&x.result==="success"&&x.email===email));});
    check("audit never contains passwords, attempted secrets or hashes",()=>{for(const secret of [password,wrong,"old123",hash])assert.equal(audit.includes(secret),false);assert.ok(records.every(x=>!("password" in x)&&!("password_hash" in x)));});
    check("database contains no plaintext test passwords",()=>{const content=JSON.stringify(stored.prepare("SELECT * FROM users").all());for(const secret of [password,wrong,"old123"])assert.equal(content.includes(secret),false);});
    stored.close();
    // Run the IP throttle on the original process; spoofed proxy headers cannot create new buckets.
    const statuses=[];
    for(let i=0;i<25;i++){const result=await a.req("/api/login","POST",{email:"throttle@example.test",password:wrong},{"X-Forwarded-For":"198.51.100."+(i+1)});statuses.push(result.status);}
    check("auth rate limit survives spoofed forwarded IPs",()=>assert.ok(statuses.includes(429)));
    const endAudit=fs.readFileSync(path.join(server.dir,"passwords"),"utf8").trim().split("\n").map(JSON.parse);
    check("throttled auth attempts are audited",()=>assert.ok(endAudit.some(x=>x.status===429&&x.operation==="login")));
    prod=await start({NODE_ENV:"production",APP_ORIGIN:"https://amigo.example"});
    const secure=new Client(prod.base);r=await secure.req("/api/csrf");
    check("production uses Secure host-prefixed cookie and HSTS",()=>{assert.match(r.cookieHeaders.join(";"),/__Host-amigo_session=/);assert.match(r.cookieHeaders.join(";"),/Secure/);assert.match(r.headers.get("strict-transport-security"),/max-age=31536000/);});
    for(let i=0;i<10;i++) assert.equal((await secure.req("/api/login","POST",{email:"locked@example.test",password:wrong})).status,401);
    r=await secure.req("/api/login","POST",{email:"locked@example.test",password:wrong});
    check("per-account throttle limits repeated failures",()=>{assert.equal(r.status,429);assert.ok(Number(r.headers.get("retry-after"))>0);});
    const existingDir=prod.dir;await stop(prod);prod=await start({NODE_ENV:"production",APP_ORIGIN:"https://amigo.example",DATA_DIR:existingDir});
    const restarted=new Client(prod.base);await restarted.req("/api/csrf");
    r=await restarted.req("/api/login","POST",{email:"locked@example.test",password:wrong});
    check("per-account throttle survives server restart",()=>assert.equal(r.status,429));
    const failed=spawnSync(process.execPath,[path.join(root,"server.js")],{cwd:root,env:{...process.env,NODE_ENV:"production",APP_ORIGIN:"http://insecure.example"},encoding:"utf8",timeout:10000});
    check("insecure production configuration fails closed",()=>{assert.equal(failed.status,1);assert.match(failed.stderr,/FATAL/);});
    console.log("SECURITY: PASS "+checks+" checks");
  } finally {await stop(server);if(prod)await stop(prod)}
}
main().catch(error=>{console.error(error);process.exitCode=1});
