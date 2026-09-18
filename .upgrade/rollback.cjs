"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=fs.realpathSync(path.join(__dirname,".."));
const requested=path.resolve(process.argv[2] || root);
const allowed=[root,path.join(root,".upgrade","rollback-test")].map(p=>fs.realpathSync(p).toLowerCase());
const target=fs.realpathSync(requested);
if(!allowed.includes(target.toLowerCase()))throw new Error("Rollback target must be this project or its dedicated rollback-test copy.");
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,"manifest.json"),"utf8"));
const hash=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").toUpperCase();
function safe(relative){
  const out=path.resolve(target,relative);
  if(!out.toLowerCase().startsWith(target.toLowerCase()+path.sep)||relative.split(/[\\/]/).includes(".."))throw new Error("Invalid rollback path.");
  let ancestor=out;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
  const real=fs.realpathSync(ancestor);
  if(real.toLowerCase()!==target.toLowerCase()&&!real.toLowerCase().startsWith(target.toLowerCase()+path.sep))throw new Error("Rollback path leaves target through a link.");
  return out;
}
for(const file of manifest.original){
  if(hash(path.join(__dirname,"original",file.path))!==file.sha256)throw new Error("Backup hash mismatch: "+file.path);
}
for(const file of manifest.modified){
  const out=safe(file.path);
  if(fs.existsSync(out)){
    const actual=hash(out),before=manifest.original.find(x=>x.path===file.path);
    if(actual!==file.sha256&&actual!==before?.sha256)throw new Error("File was edited after upgrade; preserving it: "+file.path);
  }
}
for(const file of manifest.original){
  const dest=safe(file.path);fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(path.join(__dirname,"original",file.path),dest);
  if(hash(dest)!==file.sha256)throw new Error("Restore hash verification failed: "+file.path);
}
let removed=0;
for(const relative of manifest.added){
  const out=safe(relative);if(fs.existsSync(out)){fs.unlinkSync(out);removed++;}
}
console.log("ROLLBACK: PASS "+manifest.original.length+" originals restored; "+removed+" added files removed; data untouched");
