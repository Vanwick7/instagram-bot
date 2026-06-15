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

});

export default db;