// archive.js
const express = require('express');
const Database = require('better-sqlite3');
const db = new Database('archive.db');
const router = express.Router();

db.exec(`CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  image TEXT,
  body TEXT NOT NULL,
  date TEXT NOT NULL,
  views INTEGER DEFAULT 0
)`);

const requireAdmin = (req, res, next) => {
  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
};

router.get('/articles', (req, res) =>
  res.json(db.prepare('SELECT * FROM articles ORDER BY date DESC, id DESC').all()));

router.post('/articles/:id/view', (req, res) => {
  db.prepare('UPDATE articles SET views = views + 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/articles', requireAdmin, (req, res) => {
  const { teacher, title, category, image, body } = req.body;
  if (!teacher || !title || !body) return res.status(400).json({ error: 'Missing fields' });
  const info = db.prepare(
    'INSERT INTO articles (teacher,title,category,image,body,date) VALUES (?,?,?,?,?,?)'
  ).run(teacher, title, category || '', image || '', body, new Date().toISOString().slice(0, 10));
  res.json({ id: info.lastInsertRowid });
});

router.put('/articles/:id', requireAdmin, (req, res) => {
  const { teacher, title, category, image, body } = req.body;
  db.prepare('UPDATE articles SET teacher=?, title=?, category=?, image=?, body=? WHERE id=?')
    .run(teacher, title, category || '', image || '', body, req.params.id);
  res.json({ ok: true });
});

router.delete('/articles/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;