// Serveur principal : sert le front, expose l'API bancs/notes,
// importe les bancs existants depuis OpenStreetMap (Overpass API).
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// --- Upload photo (verification banc) ---
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname || '.jpg'))
  }),
  limits: { fileSize: 8 * 1024 * 1024 }
});

// --- Bancs : lecture (bbox) ---
app.get('/api/bancs', (req, res) => {
  const { minLat, minLon, maxLat, maxLon } = req.query;
  let rows;
  if (minLat && minLon && maxLat && maxLon) {
    rows = db.prepare(`SELECT * FROM bancs WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`)
      .all(Number(minLat), Number(maxLat), Number(minLon), Number(maxLon));
  } else {
    rows = db.prepare(`SELECT * FROM bancs`).all();
  }
  const withStats = rows.map(b => {
    const stats = db.prepare(`
      SELECT COUNT(*) as nb, AVG(vue) as vue, AVG(confort) as confort, AVG(proprete) as proprete,
             AVG(poubelle) as poubelle, AVG(ombre) as ombre
      FROM notes WHERE banc_id = ?
    `).get(b.id);
    return { ...b, stats };
  });
  res.json(withStats);
});

// --- Banc : detail + notes ---
app.get('/api/bancs/:id', (req, res) => {
  const banc = db.prepare('SELECT * FROM bancs WHERE id = ?').get(req.params.id);
  if (!banc) return res.status(404).json({ error: 'introuvable' });
  const notes = db.prepare('SELECT * FROM notes WHERE banc_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ banc, notes });
});

// --- Ajout d'un banc par un utilisateur, avec photo + score de verification IA (calcule cote client) ---
app.post('/api/bancs', upload.single('photo'), (req, res) => {
  const { lat, lon, description, verified, verif_score } = req.body;
  if (!lat || !lon) return res.status(400).json({ error: 'lat/lon requis' });
  const photo_path = req.file ? '/uploads/' + req.file.filename : null;
  const info = db.prepare(`
    INSERT INTO bancs (lat, lon, source, photo_path, verified, verif_score, description)
    VALUES (?, ?, 'user', ?, ?, ?, ?)
  `).run(Number(lat), Number(lon), photo_path, verified === 'true' || verified === true ? 1 : 0, verif_score ? Number(verif_score) : null, description || null);
  res.json({ id: info.lastInsertRowid });
});

// --- Notation d'un banc ---
app.post('/api/bancs/:id/notes', (req, res) => {
  const banc = db.prepare('SELECT id FROM bancs WHERE id = ?').get(req.params.id);
  if (!banc) return res.status(404).json({ error: 'banc introuvable' });
  const { vue, poubelle, ombre, confort, proprete, commentaire } = req.body;
  const info = db.prepare(`
    INSERT INTO notes (banc_id, vue, poubelle, ombre, confort, proprete, commentaire)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, Number(vue), poubelle ? 1 : 0, ombre ? 1 : 0, Number(confort), Number(proprete), commentaire || null);
  res.json({ id: info.lastInsertRowid });
});

// --- Import automatique des bancs OSM existants dans une bbox (appelé par le front au deplacement de carte) ---
app.get('/api/import-osm', async (req, res) => {
  const { minLat, minLon, maxLat, maxLon } = req.query;
  if (!minLat || !minLon || !maxLat || !maxLon) return res.status(400).json({ error: 'bbox requise' });
  const query = `[out:json][timeout:25];node["amenity"="bench"](${minLat},${minLon},${maxLat},${maxLon});out body;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query
    });
    if (!r.ok) throw new Error('Overpass HTTP ' + r.status);
    const data = await r.json();
    const insert = db.prepare(`INSERT INTO bancs (lat, lon, source, osm_id, verified) VALUES (?, ?, 'osm', ?, 1)`);
    const exists = db.prepare(`SELECT id FROM bancs WHERE osm_id = ?`);
    let added = 0;
    const tx = db.transaction((elements) => {
      for (const el of elements) {
        const osmId = 'node/' + el.id;
        if (!exists.get(osmId)) {
          insert.run(el.lat, el.lon, osmId);
          added++;
        }
      }
    });
    tx(data.elements || []);
    res.json({ added, total: (data.elements || []).length });
  } catch (e) {
    res.status(502).json({ error: 'Overpass indisponible', detail: String(e) });
  }
});

app.listen(PORT, () => console.log(`Bancs Publics -> http://localhost:${PORT}`));
