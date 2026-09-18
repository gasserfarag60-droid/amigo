"use strict";
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const root = path.resolve(process.argv[2]);
const label = process.argv[3] || 'BASELINE';
async function main() {
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(r => probe.close(r));
  const child = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), HOST: '127.0.0.1', APP_ORIGIN: `http://127.0.0.1:${port}` }, stdio: ['ignore','pipe','pipe']
  });
  let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i=0; i<100; i++) { try { await fetch(base); break; } catch { await new Promise(r=>setTimeout(r,100)); } }
    let cookie = ''; let csrf = '';
    async function req(route, method='GET', body, sendCsrf=true) {
      const r = await fetch(base+route, { method, headers: { 'Content-Type':'application/json', ...(cookie ? {Cookie:cookie}:{}), ...(csrf && sendCsrf ? {'X-CSRF-Token':csrf}:{}) }, body:body===undefined?undefined:JSON.stringify(body) });
      const cookies=r.headers.getSetCookie(); if(cookies.length) cookie=cookies.map(c=>c.split(';')[0]).join('; ');
      const txt=await r.text(); let data; try{data=JSON.parse(txt)}catch{data=txt}
      if(data.csrfToken) csrf=data.csrfToken;
      return {r,data};
    }
    const page=await req('/'); assert.equal(page.r.status,200);
    const unauth=await req('/api/me'); assert.equal(unauth.r.status,401);
    await req('/api/csrf');
    const email=`smoke-${Date.now()}@example.test`, password='Test-only River Moon 42!';
    const reg=await req('/api/register','POST',{name:'Smoke Tester',email,password}); assert.equal(reg.r.status,201,JSON.stringify(reg.data));
    const me=await req('/api/me'); assert.equal(me.data.user.email,email);
    const post=await req('/api/posts','POST',{body:'Baseline smoke test'}); assert.equal(post.r.status,201);
    assert.equal((await req('/api/posts/'+post.data.post.id+'/like','POST',{})).data.post.likeCount,1);
    const noCsrf=await req('/api/posts','POST',{body:'CSRF probe'},false);
    const oldCookie=cookie;
    assert.equal((await req('/api/logout','POST',{})).r.status,200);
    cookie=oldCookie;
    const replay=await req('/api/me');
    const csp=!!page.r.headers.get('content-security-policy');
    const record={label,root,homepage:200,register:201,me:200,post:201,like:1,csrfMissing:noCsrf.r.status,logoutReplay:replay.r.status,csp};
    if(label==='MODIFIED') {assert.equal(noCsrf.r.status,403); assert.equal(replay.r.status,401); assert.equal(csp,true)}
    else {assert.equal(noCsrf.r.status,201); assert.equal(replay.r.status,200); assert.equal(csp,false)}
    fs.writeFileSync(path.join(__dirname,'reports',label.toLowerCase()+'.json'),JSON.stringify(record,null,2));
    console.log(`${label}: PASS homepage=200 signup=201 login-session=200 post=201 like=1 missing-CSRF=${noCsrf.r.status} logout-replay=${replay.r.status} CSP=${csp}`);
  } catch(e) {console.error(e);console.error(output);process.exitCode=1}
  finally {const done=once(child,'exit');child.kill();await done;}
}
main().catch(e=>{console.error(e);process.exitCode=1});
