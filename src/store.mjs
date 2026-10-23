import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';import {dirname} from 'node:path';
export function openStore(path){if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS accounts(user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL, created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS positions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES accounts(user_id),symbol TEXT NOT NULL,side TEXT NOT NULL,margin INTEGER NOT NULL,leverage INTEGER NOT NULL,quantity REAL NOT NULL,entry REAL NOT NULL,entry_fee INTEGER NOT NULL,opened_at INTEGER NOT NULL,closed_at INTEGER,exit REAL,pnl INTEGER,reason TEXT);
 CREATE TABLE IF NOT EXISTS events(post_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',received_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error TEXT);
 CREATE TABLE IF NOT EXISTS replies(id INTEGER PRIMARY KEY AUTOINCREMENT,post_id TEXT NOT NULL UNIQUE REFERENCES events(post_id),text TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',x_post_id TEXT,error TEXT);
 `);db.exec("UPDATE events SET status='pending' WHERE status='processing'; UPDATE replies SET status='uncertain',error='Process stopped during send; inspect X before retry' WHERE status='sending'");return db}
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}
export function enqueue(db,e){return db.prepare('INSERT OR IGNORE INTO events(post_id,user_id,text,received_at) VALUES(?,?,?,?)').run(e.postId,e.userId,e.text,e.receivedAt||Date.now()).changes>0}
