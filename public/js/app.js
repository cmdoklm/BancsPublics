// Logique front : carte Leaflet, import bancs OSM, ajout avec verif IA (COCO-SSD), notation.

const map = L.map('map', { zoomControl: true }).setView([48.8566, 2.3522], 15); // Paris par defaut
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);
const bancMarkers = new Map(); // id -> marker
let cocoModel = null;
let addLatLng = null;
let selectedFile = null;
let verified = false;
let verifScore = null;

const iconBanc = (verified) => L.divIcon({
  className: '',
  html: `<div style="font-size:26px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))">${verified ? '🪑' : '❔'}</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 26]
});

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// --- Chargement des modeles IA en tache de fond (n'empeche pas d'utiliser la carte) ---
coco_ssd.load().then(m => { cocoModel = m; console.log('Modele IA charge'); });

// --- Chargement des bancs dans la zone visible + import OSM si zone jamais vue ---
async function refreshBancs() {
  const b = map.getBounds();
  const bbox = { minLat: b.getSouth(), minLon: b.getWest(), maxLat: b.getNorth(), maxLon: b.getEast() };

  // Importe depuis OSM en arriere-plan (idempotent cote serveur)
  fetch(`/api/import-osm?minLat=${bbox.minLat}&minLon=${bbox.minLon}&maxLat=${bbox.maxLat}&maxLon=${bbox.maxLon}`)
    .then(r => r.json())
    .then(d => { if (d.added) loadBancs(bbox); })
    .catch(() => {});

  loadBancs(bbox);
}

async function loadBancs(bbox) {
  const res = await fetch(`/api/bancs?minLat=${bbox.minLat}&minLon=${bbox.minLon}&maxLat=${bbox.maxLat}&maxLon=${bbox.maxLon}`);
  const bancs = await res.json();
  for (const banc of bancs) {
    if (bancMarkers.has(banc.id)) continue;
    const marker = L.marker([banc.lat, banc.lon], { icon: iconBanc(!!banc.verified) });
    marker.on('click', () => openBancPanel(banc.id));
    marker.addTo(markersLayer);
    bancMarkers.set(banc.id, marker);
  }
}

let debounceTimer;
map.on('moveend', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refreshBancs, 400);
});
refreshBancs();

// --- Geolocalisation ---
document.getElementById('btn-locate').onclick = () => {
  if (!navigator.geolocation) return toast("Geolocalisation non disponible");
  navigator.geolocation.getCurrentPosition(
    pos => map.setView([pos.coords.latitude, pos.coords.longitude], 17),
    () => toast("Impossible de te localiser")
  );
};

// --- Panneau lateral : detail d'un banc + notation ---
async function openBancPanel(id) {
  const res = await fetch(`/api/bancs/${id}`);
  const { banc, notes } = await res.json();
  const panel = document.getElementById('side-panel');
  const content = document.getElementById('side-content');

  const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '-';
  const vues = notes.map(n => n.vue);
  const conforts = notes.map(n => n.confort);
  const propretes = notes.map(n => n.proprete);
  const poubellePct = notes.length ? Math.round(100 * notes.filter(n => n.poubelle).length / notes.length) : null;
  const ombrePct = notes.length ? Math.round(100 * notes.filter(n => n.ombre).length / notes.length) : null;

  content.innerHTML = `
    <h2>Banc #${banc.id}</h2>
    <span class="badge ${banc.source === 'osm' ? 'osm' : ''}">${banc.source === 'osm' ? 'OpenStreetMap' : 'Ajout utilisateur'}</span>
    <span class="badge ${banc.verified ? 'verified' : 'unverified'}">${banc.verified ? 'Vérifié IA' : 'Non vérifié'}</span>
    ${banc.photo_path ? `<img src="${banc.photo_path}" style="width:100%;border-radius:8px;margin-top:10px">` : ''}
    ${banc.description ? `<p>${escapeHtml(banc.description)}</p>` : ''}

    <div class="banc-card">
      <strong>Notes (${notes.length})</strong><br>
      Vue : <span class="stars">${'★'.repeat(Math.round(avg(vues))) || '-'}</span> (${avg(vues)}/5)<br>
      Confort : ${avg(conforts)}/5 — Propreté : ${avg(propretes)}/5<br>
      Poubelle à côté : ${poubellePct !== null ? poubellePct + '%' : '-'} — À l'ombre : ${ombrePct !== null ? ombrePct + '%' : '-'}
    </div>

    <div id="rating-slot"></div>

    ${notes.map(n => `
      <div class="banc-card">
        <span class="stars">${'★'.repeat(n.vue)}${'☆'.repeat(5 - n.vue)}</span>
        ${n.commentaire ? `<p>${escapeHtml(n.commentaire)}</p>` : ''}
        <small>${n.poubelle ? '🗑️ poubelle' : ''} ${n.ombre ? '🌳 ombre' : ''}</small>
      </div>
    `).join('')}
  `;

  const tpl = document.getElementById('tpl-rating-form');
  const form = tpl.content.cloneNode(true);
  document.getElementById('rating-slot').appendChild(form);
  document.querySelector('#rating-slot form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      vue: fd.get('vue'), confort: fd.get('confort'), proprete: fd.get('proprete'),
      poubelle: fd.get('poubelle') === 'on', ombre: fd.get('ombre') === 'on',
      commentaire: fd.get('commentaire')
    };
    await fetch(`/api/bancs/${id}/notes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    toast('Merci pour ta note !');
    openBancPanel(id);
  };

  panel.classList.remove('hidden');
}
document.getElementById('side-close').onclick = () => document.getElementById('side-panel').classList.add('hidden');

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// --- Ajout d'un banc ---
const modalAdd = document.getElementById('modal-add');
document.getElementById('btn-add').onclick = () => {
  addLatLng = null; selectedFile = null; verified = false; verifScore = null;
  document.getElementById('add-coords').textContent = 'Position : clique sur la carte';
  document.getElementById('photo-preview').classList.add('hidden');
  document.getElementById('verif-status').textContent = '';
  document.getElementById('verif-status').className = 'verif-status';
  document.getElementById('add-desc').value = '';
  document.getElementById('submit-add').disabled = true;
  modalAdd.classList.remove('hidden');
  toast('Clique sur la carte pour placer le banc');
};
document.getElementById('close-add').onclick = () => modalAdd.classList.add('hidden');

map.on('click', (e) => {
  if (modalAdd.classList.contains('hidden')) return;
  addLatLng = e.latlng;
  document.getElementById('add-coords').textContent = `Position : ${addLatLng.lat.toFixed(5)}, ${addLatLng.lng.toFixed(5)}`;
  checkReadyToSubmit();
});

document.getElementById('photo-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedFile = file;
  const preview = document.getElementById('photo-preview');
  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');

  const statusEl = document.getElementById('verif-status');
  statusEl.textContent = 'Analyse IA en cours...';
  statusEl.className = 'verif-status loading';
  verified = false; verifScore = null;

  await new Promise(r => preview.onload = r);

  if (!cocoModel) {
    statusEl.textContent = "Modèle IA pas encore chargé, réessaie dans quelques secondes.";
    statusEl.className = 'verif-status ko';
    checkReadyToSubmit();
    return;
  }

  const predictions = await cocoModel.detect(preview);
  // COCO-SSD n'a pas de classe "bench" dediee dans toutes les versions ; on cherche 'bench' sinon on avertit.
  const benchPred = predictions.find(p => p.class === 'bench' && p.score > 0.4);
  if (benchPred) {
    verified = true;
    verifScore = benchPred.score;
    statusEl.textContent = `✅ Banc détecté (confiance ${(benchPred.score * 100).toFixed(0)}%)`;
    statusEl.className = 'verif-status ok';
  } else {
    verified = false;
    statusEl.textContent = '⚠️ Aucun banc détecté sur la photo. Tu peux quand même envoyer, il sera marqué "non vérifié" en attendant une relecture manuelle.';
    statusEl.className = 'verif-status ko';
  }
  checkReadyToSubmit();
};

function checkReadyToSubmit() {
  document.getElementById('submit-add').disabled = !(addLatLng && selectedFile);
}

document.getElementById('submit-add').onclick = async () => {
  const fd = new FormData();
  fd.append('lat', addLatLng.lat);
  fd.append('lon', addLatLng.lng);
  fd.append('description', document.getElementById('add-desc').value);
  fd.append('verified', verified);
  if (verifScore) fd.append('verif_score', verifScore);
  if (selectedFile) fd.append('photo', selectedFile);

  const res = await fetch('/api/bancs', { method: 'POST', body: fd });
  if (res.ok) {
    toast('Banc ajouté, merci !');
    modalAdd.classList.add('hidden');
    refreshBancs();
  } else {
    toast("Erreur lors de l'ajout");
  }
};
