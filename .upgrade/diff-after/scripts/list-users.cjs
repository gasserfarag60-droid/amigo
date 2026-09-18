"use strict";
const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");
const file = path.join(path.resolve(process.env.DATA_DIR || path.join(__dirname,"..","data")), "amigo.db");
if (!fs.existsSync(file)) { console.error("No database yet. Start Amigo first."); process.exit(1); }
const db = new Database(file,{readonly:true,fileMustExist:true});
const users = db.prepare("SELECT id,name,email,created_at FROM users ORDER BY created_at DESC").all();
console.table(users.map(u => ({...u,created_at:new Date(u.created_at).toISOString()})));
db.close();
