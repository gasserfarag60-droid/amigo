"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const readJson=p=>JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,""));
const hash=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").toUpperCase();
const original=readJson(path.join(__dirname,"original-hashes.json"));
const added=["public/assets/login-collage.webp","public/assets/favicon.svg","tests/security.cjs","scripts/list-users.cjs"];
const paths=[...original.map(x=>x.path),...added];
for(const file of original){
  if(hash(path.join(root,file.path))!==file.sha256)throw new Error("Live source changed; inspect before deployment: "+file.path);
  if(hash(path.join(__dirname,"original",file.path))!==file.sha256)throw new Error("Original snapshot hash mismatch");
}
const modified=paths.map(p=>({path:p,sha256:hash(path.join(__dirname,"modified",p))}));
fs.writeFileSync(path.join(__dirname,"manifest.json"),JSON.stringify({original,modified,added},null,2)+"\n");
for(const file of original){
  const dest=path.join(__dirname,"diff-before",file.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(__dirname,"original",file.path),dest);
}
for(const file of modified){
  for(const destRoot of ["diff-after","rollback-test"]){
    const dest=path.join(__dirname,destRoot,file.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(__dirname,"modified",file.path),dest);
  }
}
const diff=spawnSync("git",["diff","--no-index","--binary","--",".upgrade/diff-before",".upgrade/diff-after"],{cwd:root,encoding:"utf8",maxBuffer:16*1024*1024});
if(![0,1].includes(diff.status))throw new Error(diff.stderr);
const patch=diff.stdout.replaceAll("a/.upgrade/diff-before/","a/").replaceAll("b/.upgrade/diff-after/","b/").replaceAll("a/.upgrade/diff-after/","a/").replaceAll("b/.upgrade/diff-before/","b/");
fs.writeFileSync(path.join(root,"DIFF.patch"),patch);
console.log("PACKAGE: PASS original hashes intact; "+paths.length+" source files; binary diff created");
