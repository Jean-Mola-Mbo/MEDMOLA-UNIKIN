#!/usr/bin/env node
/* =========================================================
   Définir ou réinitialiser un mot de passe depuis le serveur.
   Usage :
     node scripts/set-password.js <email> <motdepasse> [admin]
   Exemple :
     node scripts/set-password.js admin@medmola.cd 'MonMotDePasse2026!'
   Le drapeau « changement obligatoire » est levé : le compte peut
   se connecter directement avec ce mot de passe.
   ========================================================= */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const STORE = path.join(ROOT, "data", "db.json");

const [, , emailArg, passwordArg, roleArg] = process.argv;

if (!emailArg || !passwordArg) {
  console.error("Usage : node scripts/set-password.js <email> <motdepasse> [admin]");
  process.exit(1);
}
if (passwordArg.length < 8) {
  console.error("Le mot de passe doit contenir au moins 8 caractères.");
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const role = roleArg === "admin" ? "admin" : "etudiant";

const empty = {
  users: [],
  sessions: [],
  conversations: [],
  messages: [],
  chat: [],
  announcements: [],
  progress: {},
  attempts: [],
  resets: [],
  meta: { seq: 0, createdAt: Date.now() }
};

let db = empty;
if (fs.existsSync(STORE)) {
  db = JSON.parse(fs.readFileSync(STORE, "utf8"));
  db.users ||= [];
  db.sessions ||= [];
  db.resets ||= [];
}

const salt = crypto.randomBytes(16).toString("hex");
const passHash = crypto.scryptSync(passwordArg, salt, 64).toString("hex");

let user = db.users.find((u) => u.email === email);

if (!user) {
  user = {
    id: crypto.randomUUID(),
    nom: email.split("@")[0],
    prenom: "Utilisateur",
    email,
    telephone: "+243000000000",
    salt,
    passHash,
    role,
    faculte: "UNIKIN — Faculté de Médecine",
    promotion: "",
    bloque: false,
    doitChangerMotDePasse: false,
    createdAt: Date.now(),
    derniereConnexion: 0
  };
  db.users.push(user);
  console.log("Compte créé :", email, "(" + role + ")");
} else {
  user.salt = salt;
  user.passHash = passHash;
  user.doitChangerMotDePasse = false;
  if (roleArg === "admin") user.role = "admin";
  console.log("Mot de passe mis à jour pour :", email);
}

// Toutes les sessions actives de ce compte sont invalidées
db.sessions = db.sessions.filter((s) => s.userId !== user.id);
db.resets = (db.resets || []).filter((r) => r.userId !== user.id);

fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.writeFileSync(STORE, JSON.stringify(db, null, 2));
console.log("Enregistré dans data/db.json — les sessions existantes ont été fermées.");
