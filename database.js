import sqlite3 from "sqlite3";

const db = new sqlite3.Database("./database.sqlite");

db.serialize(() => {

db.run(`
CREATE TABLE IF NOT EXISTS posts(
id TEXT PRIMARY KEY,
author TEXT,
likes INTEGER DEFAULT 0
)
`);

// Guarda quem curtiu cada post, pra permitir curtir/descurtir (toggle)
// em vez de somar like infinitamente.
db.run(`
CREATE TABLE IF NOT EXISTS post_likes(
post_id TEXT,
user_id TEXT,
PRIMARY KEY (post_id, user_id)
)
`);

// Guarda os comentários de cada post, pra exibir dentro do embed.
db.run(`
CREATE TABLE IF NOT EXISTS post_comments(
id INTEGER PRIMARY KEY AUTOINCREMENT,
post_id TEXT,
user_id TEXT,
username TEXT,
texto TEXT,
criado_em INTEGER
)
`);

});

export default db;