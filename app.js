/* =========================================================
   MEDMOLA UNIKIN — application cliente
   (reconstruite intégralement après troncature du fichier)
   ========================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  user: null,
  courses: [],
  course: null,
  lues: new Set(),
  pollers: [],
  chatSince: 0,
  threadSince: 0,
  convId: null,
  unread: 0,
  q: "",
  resetToken: null
};

/* ---------------------------------------------------------
   Utilitaires
   --------------------------------------------------------- */

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function formValue(form, name) {
  const el = form && form.elements ? form.elements.namedItem(name) : null;
  if (!el) return "";
  return el.type === "checkbox" ? el.checked : el.value;
}

function initials(u) {
  if (!u) return "?";
  return ((u.prenom || "?")[0] + ((u.nom || "")[0] || "")).toUpperCase();
}

const dayLabel = (ts) =>
  new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });

const timeLabel = (ts) =>
  new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function whenLabel(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "à l'instant";
  if (diff < 3600_000) return Math.floor(diff / 60_000) + " min";
  if (diff < 86400_000) return timeLabel(ts);
  return dayLabel(ts);
}

function setTitle(title, sub) {
  $("#view-title").textContent = title;
  $("#view-sub").textContent = sub || "";
}

function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => box.classList.remove("show"), 3200);
}

/* ---------------------------------------------------------
   Appels API
   --------------------------------------------------------- */

async function api(path, options = {}) {
  const { method = "GET", body } = options;
  const res = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin"
  });

  let data = {};
  try { data = await res.json(); } catch (_) { /* réponse vide */ }

  if (res.status === 428) {
    showForce();
    throw new Error(data.error || "Changement de mot de passe requis.");
  }
  if (!res.ok) throw new Error(data.error || "Erreur " + res.status);
  return data;
}

/* ---------------------------------------------------------
   Écrans
   --------------------------------------------------------- */

function showAuth() {
  $("#app-shell").hidden = true;
  $("#force-screen").hidden = true;
  $("#auth-screen").hidden = false;
  showAuthPanel("login");
  const first = $("#form-login input[name=identifiant]");
  if (first) setTimeout(() => first.focus(), 60);
}

function showForce() {
  $("#app-shell").hidden = true;
  $("#auth-screen").hidden = true;
  $("#force-screen").hidden = false;
}

function showAuthPanel(name) {
  ["login", "register", "forgot", "reset"].forEach((n) => {
    const form = $("#form-" + n);
    if (form) form.hidden = n !== name;
  });
  const tabs = $(".auth-tabs");
  if (tabs) tabs.hidden = name === "forgot" || name === "reset";

  $$(".auth-tab").forEach((tab) => {
    const active = tab.dataset.tab === (name === "register" ? "register" : "login");
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  $$(".form-error").forEach((p) => { p.textContent = ""; });
  const ok = $("#forgot-ok");
  if (ok) ok.textContent = "";
}

function showApp() {
  if (!state.user) return showAuth();
  if (state.user.doitChangerMotDePasse) return showForce();

  $("#auth-screen").hidden = true;
  $("#force-screen").hidden = true;
  $("#app-shell").hidden = false;

  $("#side-name").textContent = `${state.user.prenom} ${state.user.nom}`;
  $("#side-role").textContent =
    state.user.role === "admin" ? "Administrateur" : state.user.promotion || "Étudiant";
  $("#side-avatar").textContent = initials(state.user);
  $("#nav-admin").hidden = state.user.role !== "admin";
  $("#topbar-date").textContent = new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long"
  });

  bindShell();
  startUnreadPolling();

  if (!location.hash || location.hash === "#") location.hash = "#/accueil";
  route();
}

/* ---------------------------------------------------------
   Authentification
   --------------------------------------------------------- */

function bindAuth() {
  $$(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => showAuthPanel(tab.dataset.tab));
  });

  const showForgot = $("#show-forgot");
  if (showForgot) showForgot.addEventListener("click", () => showAuthPanel("forgot"));

  const backLogin = $("#back-login");
  if (backLogin) backLogin.addEventListener("click", () => showAuthPanel("login"));

  const cancelReset = $("#cancel-reset");
  if (cancelReset) cancelReset.addEventListener("click", () => {
    history.replaceState(null, "", location.pathname);
    state.resetToken = null;
    showAuthPanel("login");
  });

  /* --- Connexion --- */
  $("#form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const err = $("#login-error");
    const btn = form.querySelector("button[type=submit]");
    err.textContent = "";
    btn.disabled = true;
    try {
      const { user } = await api("/login", {
        method: "POST",
        body: {
          identifiant: formValue(form, "identifiant").trim(),
          motDePasse: formValue(form, "motDePasse")
        }
      });
      state.user = user;
      form.reset();
      showApp();
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  });

  /* --- Inscription --- */
  $("#form-register").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const err = $("#register-error");
    const btn = form.querySelector("button[type=submit]");
    err.textContent = "";

    if (!formValue(form, "conditions")) {
      err.textContent = "Vous devez accepter l'utilisation de vos données pour créer un compte.";
      return;
    }
    if (formValue(form, "motDePasse") !== formValue(form, "confirmation")) {
      err.textContent = "Les deux mots de passe ne correspondent pas.";
      return;
    }

    btn.disabled = true;
    try {
      const { user } = await api("/register", {
        method: "POST",
        body: {
          prenom: formValue(form, "prenom").trim(),
          nom: formValue(form, "nom").trim(),
          email: formValue(form, "email").trim(),
          telephone: formValue(form, "telephone").trim(),
          faculte: formValue(form, "faculte"),
          promotion: formValue(form, "promotion"),
          motDePasse: formValue(form, "motDePasse"),
          confirmation: formValue(form, "confirmation")
        }
      });
      state.user = user;
      form.reset();
      toast("Bienvenue sur MEDMOLA UNIKIN.");
      showApp();
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  });

  /* --- Mot de passe oublié --- */
  $("#form-forgot").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const err = $("#forgot-error");
    const okMsg = $("#forgot-ok");
    const btn = form.querySelector("button[type=submit]");
    err.textContent = "";
    okMsg.textContent = "";
    btn.disabled = true;
    try {
      const res = await api("/forgot", { method: "POST", body: { email: formValue(form, "email").trim() } });
      okMsg.textContent = res.message || "Si un compte existe, un lien a été envoyé.";
      if (res.envoyeParEmail === false) {
        okMsg.textContent += " L'envoi automatique n'est pas configuré : contactez l'administration pour obtenir votre lien.";
      }
      form.reset();
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  });

  /* --- Nouveau mot de passe (lien reçu) --- */
  $("#form-reset").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const err = $("#reset-error");
    const btn = form.querySelector("button[type=submit]");
    err.textContent = "";

    if (formValue(form, "motDePasse") !== formValue(form, "confirmation")) {
      err.textContent = "Les deux mots de passe ne correspondent pas.";
      return;
    }

    btn.disabled = true;
    try {
      await api("/reset", {
        method: "POST",
        body: {
          token: state.resetToken,
          motDePasse: formValue(form, "motDePasse"),
          confirmation: formValue(form, "confirmation")
        }
      });
      form.reset();
      state.resetToken = null;
      history.replaceState(null, "", location.pathname);
      toast("Mot de passe modifié. Vous pouvez vous connecter.");
      showAuthPanel("login");
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  });

  /* --- Changement obligatoire --- */
  $("#form-force").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const err = $("#force-error");
    const btn = form.querySelector("button[type=submit]");
    err.textContent = "";

    if (formValue(form, "motDePasse") !== formValue(form, "confirmation")) {
      err.textContent = "Les deux mots de passe ne correspondent pas.";
      return;
    }

    btn.disabled = true;
    try {
      const { user } = await api("/me", {
        method: "PATCH",
        body: { motDePasse: formValue(form, "motDePasse"), confirmation: formValue(form, "confirmation") }
      });
      state.user = user;
      form.reset();
      showApp();
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  });

  const forceLogout = $("#force-logout");
  if (forceLogout) forceLogout.addEventListener("click", async () => {
    try { await api("/logout", { method: "POST" }); } catch (_) {}
    state.user = null;
    showAuth();
  });
}

/* ---------------------------------------------------------
   Coquille applicative
   --------------------------------------------------------- */

let shellBound = false;

function bindShell() {
  if (shellBound) return;
  shellBound = true;

  $("#btn-logout").addEventListener("click", async () => {
    try { await api("/logout", { method: "POST" }); } catch (_) {}
    state.user = null;
    state.courses = [];
    showAuth();
  });

  $("#btn-burger").addEventListener("click", () => {
    $("#sidebar").classList.toggle("open");
  });

  $("#search-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const q = $("#search-input").value.trim();
    if (q.length < 2) {
      toast("Saisissez au moins deux caractères.");
      return;
    }
    state.q = q;
    if (location.hash === "#/recherche") route();
    else location.hash = "#/recherche";
  });

  window.addEventListener("hashchange", route);
}

function clearPollers() {
  state.pollers.forEach((id) => clearInterval(id));
  state.pollers = [];
}

function addPoller(fn, ms) {
  const id = setInterval(fn, ms);
  state.pollers.push(id);
  return id;
}

function route() {
  if (!state.user) return;
  clearPollers();
  document.onkeydown = null;
  $("#sidebar").classList.remove("open");

  const raw = (location.hash || "#/accueil").replace(/^#\/?/, "");
  const parts = raw.split("/");
  const seg = parts[0] || "accueil";

  $$(".nav-link").forEach((l) => l.classList.toggle("is-active", l.dataset.view === seg));

  switch (seg) {
    case "accueil": return renderHome();
    case "cours": return parts[1] ? renderCourse(parts[1], parts[2] ? Number(parts[2]) : null) : renderCourses();
    case "quiz": return parts[1] ? renderQuizRun(parts[1], parts[2] === "approfondi" ? "approfondi" : "elementaire") : renderQuizList();
    case "messages": return renderMessages(parts[1] || null);
    case "chat": return renderChat();
    case "admin": return renderAdmin();
    case "profil": return renderProfile();
    case "recherche": return renderSearch();
    default: return renderHome();
  }
}

/* ---------------------------------------------------------
   Accueil
   --------------------------------------------------------- */

async function renderHome() {
  setTitle("Accueil", "Votre tableau de bord");
  const view = $("#view");
  view.innerHTML = `<div class="empty">Chargement…</div>`;

  try {
    const [{ announcements }, { courses }] = await Promise.all([api("/announcements"), api("/courses")]);
    state.courses = courses;

    const lues = courses.reduce((n, c) => n + (c.lues || 0), 0);
    const total = courses.reduce((n, c) => n + (c.nbFiches || 0), 0);
    const commences = courses.filter((c) => c.lues > 0).length;
    const enCours = courses.filter((c) => c.lues > 0 && c.lues < c.nbFiches).slice(0, 3);

    view.innerHTML = `
      <div class="stack">
        <section class="hero">
          <h2>Bonjour ${esc(state.user.prenom)}, prêt à avancer ?</h2>
          <p>${lues} fiche${lues > 1 ? "s" : ""} lue${lues > 1 ? "s" : ""} sur ${total} — ${commences} cours commencé${commences > 1 ? "s" : ""}.</p>
          <div class="row">
            <a class="btn btn-vert" href="#/cours">Reprendre un cours</a>
            <a class="btn btn-ghost" href="#/quiz" style="color:#eef6f6;border-color:rgba(238,246,246,.35)">Tester mes connaissances</a>
          </div>
        </section>

        <div class="grid grid-4">
          <div class="stat">
            <p class="stat-value">${lues}</p>
            <p class="stat-label">Fiches lues</p>
            <p class="stat-sub">sur ${total} au programme</p>
          </div>
          <div class="stat">
            <p class="stat-value">${courses.length}</p>
            <p class="stat-label">Cours disponibles</p>
            <p class="stat-sub">${courses.reduce((n, c) => n + (c.nbChapitres || 0), 0)} chapitres</p>
          </div>
          <div class="stat">
            <p class="stat-value">${commences}</p>
            <p class="stat-label">Cours commencés</p>
            <p class="stat-sub">continuez là où vous en êtes</p>
          </div>
          <div class="stat">
            <p class="stat-value">${state.unread || 0}</p>
            <p class="stat-label">Messages non lus</p>
            <p class="stat-sub"><a href="#/messages">Ouvrir la messagerie</a></p>
          </div>
        </div>

        <div class="grid grid-2">
          <section class="card card-pad">
            <div class="card-head"><h3 class="card-title">Continuer</h3><a class="tiny" href="#/cours">Tous les cours</a></div>
            ${enCours.length ? `<div class="stack">${enCours.map((c) => `
              <a class="course-card" href="#/cours/${esc(c.id)}">
                <div class="row" style="justify-content:space-between">
                  <h3>${esc(c.titre)}</h3><span class="tag">${esc(c.code)}</span>
                </div>
                <div class="progress"><span style="width:${Math.round((c.lues / c.nbFiches) * 100)}%"></span></div>
                <div class="progress-meta"><span>${c.lues} / ${c.nbFiches} fiches</span><span>${Math.round((c.lues / c.nbFiches) * 100)} %</span></div>
              </a>`).join("")}</div>`
              : `<p class="muted">Aucun cours commencé. <a href="#/cours">Choisissez un cours</a> pour démarrer.</p>`}
          </section>

          <section class="card card-pad">
            <div class="card-head"><h3 class="card-title">Annonces de l'administration</h3></div>
            ${announcements.length ? `<div class="stack">${announcements.slice(0, 4).map((a) => `
              <article class="annonce">
                <p class="tiny">${esc(dayLabel(a.at))} · ${esc(a.by || "Administration")}</p>
                <h4>${esc(a.titre)}</h4>
                <p>${esc(a.texte).replace(/\n/g, "<br>")}</p>
              </article>`).join("")}</div>`
              : `<p class="muted">Aucune annonce pour le moment.</p>`}
          </section>
        </div>
      </div>`;
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ---------------------------------------------------------
   Liste des cours
   --------------------------------------------------------- */

async function renderCourses() {
  setTitle("Cours", "14 cours au programme");
  const view = $("#view");
  view.innerHTML = `<div class="empty">Chargement…</div>`;

  try {
    const { courses } = await api("/courses");
    state.courses = courses;

    view.innerHTML = `<div class="grid grid-3">
      ${courses.map((c) => {
        const pct = c.nbFiches ? Math.round((c.lues / c.nbFiches) * 100) : 0;
        return `<a class="course-card" href="#/cours/${esc(c.id)}">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <h3>${esc(c.titre)}</h3>
            <span class="tag">${esc(c.code)}</span>
          </div>
          <p class="muted" style="font-size:13px;line-height:1.5">${esc(c.resume)}</p>
          <div class="course-meta">
            <span>${esc(c.niveau)}</span><span>·</span><span>${c.credits} crédits</span>
            <span>·</span><span>${c.nbFiches} fiches</span>
          </div>
          <div class="course-progress">
            <div class="progress"><span style="width:${pct}%"></span></div>
            <div class="progress-meta"><span>${c.lues} / ${c.nbFiches}</span><span>${pct} %</span></div>
          </div>
          ${c.statut !== "complet" ? `<span class="tag tag-or">Programme officiel</span>` : ""}
        </a>`;
      }).join("")}
    </div>`;
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ---------------------------------------------------------
   Lecteur de cours
   --------------------------------------------------------- */

async function renderCourse(courseId, ficheNum) {
  const view = $("#view");
  view.innerHTML = `<div class="empty">Chargement…</div>`;
  setTitle("Cours", "Chargement…");

  try {
    const { course, lues } = await api("/courses/" + encodeURIComponent(courseId));
    state.course = course;
    state.lues = new Set(lues || []);

    const fiches = [];
    (course.chapitres || []).forEach((ch) => {
      (ch.fiches || []).forEach((f) => fiches.push({ ...f, chapitre: ch.titre }));
    });

    setTitle(course.titre, `${course.code} · ${fiches.length} fiches`);

    if (!fiches.length) {
      view.innerHTML = `<div class="card card-pad">
        <span class="tag tag-or">Contenu en préparation</span>
        <h3 class="card-title" style="margin:12px 0 10px">${esc(course.titre)}</h3>
        <p class="muted">${esc(course.resume)}</p>
        <h4 style="margin:22px 0 10px">Programme officiel</h4>
        <ol class="stack">${(course.chapitres || []).map((ch) => `
          <li><strong>${esc(ch.titre)}</strong>${ch.plan ? `<p class="muted" style="font-size:13.5px">${esc(ch.plan)}</p>` : ""}</li>`).join("")}
        </ol>
      </div>`;
      return;
    }

    const current = Math.min(Math.max(ficheNum || 1, 1), fiches.length);
    const fiche = fiches[current - 1];

    view.innerHTML = `<div class="reader">
      <aside class="reader-nav card">
        <div class="reader-nav-inner">
          ${(course.chapitres || []).map((ch) => `
            <p class="chapter-title">${esc(ch.titre)}</p>
            ${(ch.fiches || []).map((f) => `
              <a class="fiche-link ${f.n === current ? "is-active" : ""} ${state.lues.has(f.n) ? "is-read" : ""}"
                 href="#/cours/${esc(course.id)}/${f.n}">
                <span class="num">${String(f.n).padStart(2, "0")}</span>
                <span>${esc(f.titre)}</span>
              </a>`).join("")}`).join("")}
        </div>
      </aside>

      <article class="fiche-main">
        <header class="fiche-head">
          <p class="fiche-eyebrow">${esc(fiche.chapitre)}</p>
          <h2 class="fiche-title">${esc(fiche.titre)}</h2>
          ${fiche.objectifs && fiche.objectifs.length ? `
            <div class="fiche-objectifs">
              <p>Objectifs</p>
              <ul>${fiche.objectifs.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
            </div>` : ""}
        </header>

        <div class="fiche-body">${fiche.contenu || ""}</div>

        ${fiche.points && fiche.points.length ? `
          <div class="keypoints">
            <p>Points clés</p>
            <ul>${fiche.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
          </div>` : ""}

        ${fiche.question ? `
          <div class="revision-q"><strong>Question de révision</strong>${esc(fiche.question)}</div>` : ""}

        <footer class="fiche-foot">
          <a class="btn btn-quiet btn-sm" href="${current > 1 ? `#/cours/${esc(course.id)}/${current - 1}` : "#/cours"}">← Précédent</a>
          <div class="row">
            <button class="btn btn-quiet btn-sm" id="btn-print">Imprimer / PDF</button>
            ${current < fiches.length
              ? `<a class="btn btn-primary btn-sm" href="#/cours/${esc(course.id)}/${current + 1}">Suivant →</a>`
              : `<a class="btn btn-vert btn-sm" href="#/quiz/${esc(course.id)}/elementaire">Passer au quiz</a>`}
          </div>
        </footer>
      </article>
    </div>`;

    // marquage de lecture
    if (!state.lues.has(fiche.n)) {
      api("/progress", { method: "POST", body: { courseId: course.id, fiche: fiche.n } })
        .then(() => state.lues.add(fiche.n))
        .catch(() => {});
    }

    const print = $("#btn-print");
    if (print) print.addEventListener("click", () => window.print());

    document.onkeydown = (ev) => {
      if (ev.target.matches("input, textarea, select")) return;
      if (ev.key === "ArrowRight" && current < fiches.length) location.hash = `#/cours/${course.id}/${current + 1}`;
      if (ev.key === "ArrowLeft" && current > 1) location.hash = `#/cours/${course.id}/${current - 1}`;
    };

    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ---------------------------------------------------------
   Quiz
   --------------------------------------------------------- */

async function renderQuizList() {
  setTitle("Quiz", "Deux niveaux : élémentaire et approfondi");
  const view = $("#view");
  view.innerHTML = `<div class="empty">Chargement…</div>`;

  try {
    const { quiz, tentatives } = await api("/quiz");
    view.innerHTML = `<div class="stack">
      <div class="card card-pad">
        <h3 class="card-title">Évaluez-vous</h3>
        <p class="muted" style="margin-top:6px">Chaque cours propose deux séries : les questions élémentaires vérifient les bases, les approfondies exigent de relier plusieurs notions.</p>
      </div>

      <div class="grid grid-3">
        ${quiz.map((q) => `
          <div class="quiz-card">
            <h3>${esc(q.titre)}</h3>
            <p class="tiny">${q.elementaire} questions élémentaires · ${q.approfondi} approfondies</p>
            <div class="row" style="margin-top:auto">
              <a class="btn btn-primary btn-sm" href="#/quiz/${esc(q.courseId)}/elementaire">Élémentaire</a>
              <a class="btn btn-quiet btn-sm" href="#/quiz/${esc(q.courseId)}/approfondi">Approfondi</a>
            </div>
          </div>`).join("")}
      </div>

      ${tentatives.length ? `
        <div class="card card-pad">
          <h3 class="card-title">Mes derniers résultats</h3>
          <div class="table-wrap"><table>
            <thead><tr><th>Cours</th><th>Niveau</th><th>Score</th><th>Date</th></tr></thead>
            <tbody>${tentatives.map((t) => `
              <tr><td>${esc(t.titre)}</td><td>${t.niveau === "approfondi" ? "Approfondi" : "Élémentaire"}</td>
              <td><strong>${t.score}/${t.total}</strong></td><td>${esc(dayLabel(t.at))}</td></tr>`).join("")}
            </tbody>
          </table></div>
        </div>` : ""}
    </div>`;
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

async function renderQuizRun(courseId, niveau) {
  const view = $("#view");
  view.innerHTML = `<div class="empty">Chargement…</div>`;
  setTitle("Quiz", "Chargement…");

  let data;
  try {
    data = await api(`/quiz/${encodeURIComponent(courseId)}?niveau=${niveau}`);
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }

  const questions = data.questions;
  const answers = new Array(questions.length).fill(null);
  let index = 0;
  const label = niveau === "approfondi" ? "Approfondi" : "Élémentaire";
  setTitle(data.titre, `Quiz ${label.toLowerCase()} · ${questions.length} questions`);

  function paint() {
    const q = questions[index];
    const pct = Math.round((index / questions.length) * 100);
    view.innerHTML = `<div class="stack">
      <div class="card card-pad">
        <div class="quiz-progress">
          <div class="progress"><span style="width:${pct}%"></span></div>
          <div class="progress-meta"><span>Question ${index + 1} / ${questions.length}</span><span>${label}</span></div>
        </div>

        <h3 class="quiz-question">${esc(q.q)}</h3>
        <div class="quiz-options">
          ${q.options.map((opt, i) => `
            <button class="quiz-option ${answers[index] === i ? "is-selected" : ""}" data-i="${i}">
              <span class="letter">${String.fromCharCode(65 + i)}</span>
              <span>${esc(opt)}</span>
            </button>`).join("")}
        </div>

        <div class="row" style="justify-content:space-between;margin-top:20px">
          <button class="btn btn-quiet btn-sm" id="q-back" ${index === 0 ? "disabled" : ""}>← Précédent</button>
          <button class="btn btn-primary" id="q-next" ${answers[index] === null ? "disabled" : ""}>
            ${index === questions.length - 1 ? "Terminer" : "Suivant →"}
          </button>
        </div>
      </div>
    </div>`;

    $$(".quiz-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        answers[index] = Number(btn.dataset.i);
        paint();
      });
    });

    $("#q-back").addEventListener("click", () => {
      if (index > 0) { index -= 1; paint(); }
    });

    $("#q-next").addEventListener("click", async () => {
      if (answers[index] === null) return;
      if (index < questions.length - 1) { index += 1; paint(); return; }
      await submit();
    });
  }

  async function submit() {
    view.innerHTML = `<div class="empty">Correction en cours…</div>`;
    try {
      const res = await api("/quiz/submit", {
        method: "POST",
        body: { courseId, niveau, answers }
      });

      const pct = Math.round((res.score / res.total) * 100);
      let message = "Continuez à réviser : reprenez les fiches du cours.";
      if (pct >= 80) message = "Très bon niveau : les notions essentielles sont acquises.";
      else if (pct >= 50) message = "Base correcte : revoyez les questions manquées.";

      view.innerHTML = `<div class="stack">
        <div class="card card-pad">
          <div class="result-score">
            <div class="score-ring">
              <svg width="110" height="110" viewBox="0 0 110 110" aria-hidden="true">
                <circle cx="55" cy="55" r="46" fill="none" stroke="#e9eef0" stroke-width="9"></circle>
                <circle cx="55" cy="55" r="46" fill="none" stroke="#12736b" stroke-width="9" stroke-linecap="round"
                  stroke-dasharray="${2 * Math.PI * 46}" stroke-dashoffset="${2 * Math.PI * 46 * (1 - res.score / res.total)}"></circle>
              </svg>
              <div class="val"><b>${res.score}/${res.total}</b><span>${pct} %</span></div>
            </div>
            <div>
              <h3 class="card-title">${esc(data.titre)} — ${label}</h3>
              <p class="muted" style="margin-top:6px">${message}</p>
              <div class="row" style="margin-top:14px">
                <a class="btn btn-primary btn-sm" href="#/quiz/${esc(courseId)}/${niveau}">Refaire</a>
                <a class="btn btn-quiet btn-sm" href="#/cours/${esc(courseId)}">Revoir le cours</a>
                <a class="btn btn-quiet btn-sm" href="#/quiz">Autres quiz</a>
              </div>
            </div>
          </div>
        </div>

        <div class="card card-pad">
          <h3 class="card-title">Correction détaillée</h3>
          <div class="correction">
            ${res.details.map((d, i) => `
              <div class="correction-item ${d.correct ? "ok" : "ko"}">
                <p class="q">${i + 1}. ${esc(questions[i].q)}</p>
                <p class="a">Votre réponse : ${esc(questions[i].options[d.donnee] || "—")}${d.correct ? " ✓" : ""}</p>
                ${d.correct ? "" : `<p class="a">Bonne réponse : <strong>${esc(questions[i].options[d.reponse])}</strong></p>`}
                ${d.explication ? `<p class="exp">${esc(d.explication)}</p>` : ""}
              </div>`).join("")}
          </div>
        </div>
      </div>`;
    } catch (e) {
      view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }

  paint();
}

/* ---------------------------------------------------------
   Recherche globale
   --------------------------------------------------------- */

async function renderSearch() {
  const q = state.q || "";
  setTitle("Recherche", q ? `« ${q} »` : "Saisissez un mot-clé");
  const view = $("#view");

  if (!q || q.length < 2) {
    view.innerHTML = `<div class="empty">Utilisez la barre de recherche en haut de la page.</div>`;
    return;
  }

  view.innerHTML = `<div class="empty">Recherche…</div>`;

  try {
    const { results } = await api("/search?q=" + encodeURIComponent(q));
    if (!results.length) {
      view.innerHTML = `<div class="empty">Aucun résultat pour « ${esc(q)} ».</div>`;
      return;
    }

    const groups = {};
    results.forEach((r) => {
      (groups[r.courseId] = groups[r.courseId] || { titre: r.courseTitre, items: [] }).items.push(r);
    });

    view.innerHTML = `<div class="stack">
      <p class="muted">${results.length} fiche${results.length > 1 ? "s" : ""} trouvée${results.length > 1 ? "s" : ""}</p>
      ${Object.entries(groups).map(([id, g]) => `
        <section class="card card-pad">
          <div class="card-head"><h3 class="card-title">${esc(g.titre)}</h3><span class="tag">${g.items.length}</span></div>
          <div class="stack">
            ${g.items.map((r) => `
              <a class="search-hit" href="#/cours/${esc(id)}/${r.n}">
                <span class="search-hit-title">${esc(r.titre)}</span>
                <span class="tiny">${esc(r.chapitre)} · fiche ${r.n}</span>
                <span class="search-hit-text">${esc(r.extrait)}…</span>
              </a>`).join("")}
          </div>
        </section>`).join("")}
    </div>`;
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ---------------------------------------------------------
   Messagerie privée
   --------------------------------------------------------- */

async function renderMessages(convId) {
  setTitle("Messagerie", "Messages privés entre inscrits");
  const view = $("#view");
  view.innerHTML = `<div class="chat-layout">
    <aside class="conv-list">
      <div class="conv-search"><input id="conv-search" placeholder="Rechercher un étudiant…" autocomplete="off"></div>
      <div class="conv-items" id="conv-items"><p class="empty">Chargement…</p></div>
    </aside>
    <section class="chat-panel" id="thread-panel">
      <div class="chat-empty">Sélectionnez une conversation ou cherchez un étudiant pour commencer.</div>
    </section>
  </div>`;

  let conversations = [];

  async function loadConversations() {
    try {
      const res = await api("/conversations");
      conversations = res.conversations;
      paintConversations();
    } catch (e) {
      $("#conv-items").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    }
  }

  function paintConversations() {
    const box = $("#conv-items");
    if (!conversations.length) {
      box.innerHTML = `<p class="empty" style="padding:16px">Aucune conversation. Cherchez un étudiant ci-dessus.</p>`;
      return;
    }
    box.innerHTML = conversations.map((c) => `
      <button class="conv-item ${c.id === convId ? "is-active" : ""}" data-conv="${esc(c.id)}">
        <span class="avatar">${esc(initials(c.peer))}</span>
        <span>
          <span class="nm">${esc(c.peer.prenom)} ${esc(c.peer.nom)}</span>
          <span class="last">${esc(c.last ? c.last.text : "Nouvelle conversation")}</span>
        </span>
        <span>
          <div class="time">${esc(c.last ? whenLabel(c.last.at) : "")}</div>
          ${c.unread ? `<div class="unread-badge">${c.unread}</div>` : ""}
        </span>
      </button>`).join("");

    $$(".conv-item").forEach((btn) => {
      btn.addEventListener("click", () => { location.hash = "#/messages/" + btn.dataset.conv; });
    });
  }

  async function paintUsers(list) {
    const box = $("#conv-items");
    if (!list.length) {
      box.innerHTML = `<p class="empty" style="padding:16px">Aucun étudiant trouvé.</p>`;
      return;
    }
    box.innerHTML = list.map((u) => `
      <button class="conv-item" data-user="${esc(u.id)}">
        <span class="avatar">${esc(initials(u))}</span>
        <span>
          <span class="nm">${esc(u.prenom)} ${esc(u.nom)}</span>
          <span class="last">${esc(u.role === "admin" ? "Administration" : u.promotion || "Étudiant")}</span>
        </span>
        <span class="time">${u.enLigne ? "en ligne" : ""}</span>
      </button>`).join("");

    $$(".conv-item[data-user]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const { id } = await api("/conversations", { method: "POST", body: { peerId: btn.dataset.user } });
          location.hash = "#/messages/" + id;
        } catch (e) { toast(e.message); }
      });
    });
  }

  let searchTimer;
  $("#conv-search").addEventListener("input", (ev) => {
    const q = ev.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      if (!q) return loadConversations();
      try {
        const { users } = await api("/users?q=" + encodeURIComponent(q));
        paintUsers(users);
      } catch (e) { toast(e.message); }
    }, 260);
  });

  async function openThread(id) {
    const panel = $("#thread-panel");
    const conv = conversations.find((c) => c.id === id);
    const peer = conv ? conv.peer : null;

    panel.innerHTML = `<div class="chat-head">
        <span class="avatar">${esc(peer ? initials(peer) : "?")}</span>
        <div><h3>${esc(peer ? peer.prenom + " " + peer.nom : "Conversation")}</h3>
        <p class="sub">${peer && peer.role === "admin" ? "Administration" : "Étudiant"}</p></div>
      </div>
      <div class="chat-body" id="thread-body"></div>
      <form class="chat-input" id="thread-form">
        <input name="text" placeholder="Écrire un message…" autocomplete="off">
        <button class="btn btn-primary btn-sm" type="submit">Envoyer</button>
      </form>`;

    const body = $("#thread-body");
    let lastAt = 0;
    const seen = new Set();

    function append(list) {
      list.forEach((m) => {
        if (seen.has(m.id)) return;
        seen.add(m.id);
        const mine = m.fromId === state.user.id;
        const div = document.createElement("div");
        div.className = "msg" + (mine ? " mine" : "");
        div.innerHTML = `${mine ? "" : `<span class="who">${esc(peer ? peer.prenom : "")}</span>`}
          <span class="bubble">${esc(m.text)}</span>
          <span class="when">${esc(timeLabel(m.at))}</span>`;
        body.appendChild(div);
      });
      body.scrollTop = body.scrollHeight;
    }

    async function pull() {
      try {
        const { messages } = await api(`/conversations/${encodeURIComponent(id)}/messages?since=${lastAt}`);
        if (messages.length) {
          lastAt = messages[messages.length - 1].at;
          append(messages);
        }
      } catch (e) { /* silencieux */ }
    }

    await pull();
    addPoller(pull, 3000);

    $("#thread-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const input = ev.currentTarget.elements.namedItem("text");
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      try {
        const { message } = await api(`/conversations/${encodeURIComponent(id)}/messages`, {
          method: "POST", body: { text }
        });
        append([message]);
        lastAt = Math.max(lastAt, message.at);
        loadConversations();
      } catch (e) { toast(e.message); }
    });
  }

  await loadConversations();
  if (convId) openThread(convId);

  addPoller(loadConversations, 10000);
}

/* ---------------------------------------------------------
   Chat général
   --------------------------------------------------------- */

async function renderChat() {
  setTitle("Chat général", "Le salon de toute la promotion");
  const view = $("#view");

  view.innerHTML = `<div class="chat-layout single">
    <section class="chat-panel">
      <div class="chat-head">
        <span class="avatar">◎</span>
        <div><h3>Salon général</h3><p class="sub" id="chat-count">—</p></div>
      </div>
      <div class="chat-body" id="chat-body"></div>
      <form class="chat-input" id="chat-form">
        <input name="text" placeholder="Écrire dans le salon général…" autocomplete="off" maxlength="2000">
        <button class="btn btn-primary btn-sm" type="submit">Envoyer</button>
      </form>
    </section>
  </div>`;

  const body = $("#chat-body");
  const seen = new Set();
  let lastAt = 0;

  function bubble(m) {
    const mine = m.fromId === state.user.id;
    const div = document.createElement("div");
    div.className = "msg" + (mine ? " mine" : "");
    div.innerHTML = `${mine ? "" : `<span class="who">${esc(m.auteur)}${m.role === "admin" ? " · administration" : ""}</span>`}
      <span class="bubble">${esc(m.text)}</span>
      <span class="when">${esc(whenLabel(m.at))}</span>`;
    if (mine || state.user.role === "admin") {
      const actions = document.createElement("span");
      actions.className = "msg-actions";
      const del = document.createElement("button");
      del.className = "msg-del";
      del.textContent = "supprimer";
      del.addEventListener("click", async () => {
        try {
          await api("/chat/" + m.id, { method: "DELETE" });
          div.remove();
        } catch (e) { toast(e.message); }
      });
      actions.appendChild(del);
      div.appendChild(actions);
    }
    body.appendChild(div);
  }

  function append(list) {
    list.forEach((m) => {
      if (seen.has(m.id)) return;
      seen.add(m.id);
      bubble(m);
    });
    body.scrollTop = body.scrollHeight;
    $("#chat-count").textContent = seen.size + " message" + (seen.size > 1 ? "s" : "");
  }

  async function pull() {
    try {
      const { messages } = await api("/chat?since=" + lastAt);
      if (messages.length) {
        lastAt = messages[messages.length - 1].at;
        append(messages);
      }
    } catch (e) { /* silencieux */ }
  }

  await pull();
  if (!seen.size) body.innerHTML = `<p class="chat-empty">Aucun message pour le moment. Lancez la conversation.</p>`;
  addPoller(pull, 3000);

  $("#chat-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const input = ev.currentTarget.elements.namedItem("text");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try {
      const { message } = await api("/chat", { method: "POST", body: { text } });
      append([message]);
      lastAt = Math.max(lastAt, message.at);
    } catch (e) { toast(e.message); }
  });
}

/* ---------------------------------------------------------
   Administration
   --------------------------------------------------------- */

async function renderAdmin() {
  setTitle("Administration", "Annonces, modération et suivi des inscrits");
  const view = $("#view");
  view.innerHTML = `<div class="empty">Chargement…</div>`;

  try {
    const [{ stats }, { users }, { announcements }] = await Promise.all([
      api("/admin/stats"), api("/admin/users"), api("/announcements")
    ]);

    view.innerHTML = `<div class="stack">
      <div class="grid grid-4">
        <div class="stat"><p class="stat-value">${stats.etudiants}</p><p class="stat-label">Étudiants inscrits</p><p class="stat-sub">${stats.connectes} actifs sur 24 h</p></div>
        <div class="stat"><p class="stat-value">${stats.fiches}</p><p class="stat-label">Fiches publiées</p><p class="stat-sub">${stats.cours} cours</p></div>
        <div class="stat"><p class="stat-value">${stats.messagesChat}</p><p class="stat-label">Messages du salon</p><p class="stat-sub">${stats.messagesPrives} messages privés</p></div>
        <div class="stat"><p class="stat-value">${stats.quizPasses}</p><p class="stat-label">Quiz passés</p><p class="stat-sub">${stats.smtpConfigured ? "E-mail activé" : "E-mail non configuré"}</p></div>
      </div>

      <section class="card card-pad">
        <div class="card-head"><h3 class="card-title">Publier une annonce</h3></div>
        <form id="annonce-form" class="stack">
          <label class="field"><span>Titre</span><input name="titre" maxlength="140" required></label>
          <label class="field"><span>Message</span><textarea name="texte" rows="4" maxlength="4000" required></textarea></label>
          <div><button class="btn btn-primary" type="submit">Publier</button></div>
        </form>
        <div class="stack" style="margin-top:18px">
          ${announcements.length ? announcements.map((a) => `
            <article class="annonce">
              <div class="row" style="justify-content:space-between">
                <p class="tiny">${esc(dayLabel(a.at))} · ${esc(a.by || "")}</p>
                <button class="btn btn-danger btn-sm" data-del-ann="${esc(a.id)}">Supprimer</button>
              </div>
              <h4>${esc(a.titre)}</h4>
              <p>${esc(a.texte).replace(/\n/g, "<br>")}</p>
            </article>`).join("") : `<p class="muted">Aucune annonce publiée.</p>`}
        </div>
      </section>

      <section class="card card-pad">
        <div class="card-head"><h3 class="card-title">Inscrits</h3><span class="tag">${users.length}</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Étudiant</th><th>Contact</th><th>Faculté</th><th>Fiches</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              ${users.map((u) => `
                <tr>
                  <td><strong>${esc(u.prenom)} ${esc(u.nom)}</strong><br><span class="tiny">${esc(u.role === "admin" ? "Administrateur" : u.promotion || "—")}</span></td>
                  <td><span class="tiny">${esc(u.email)}<br>${esc(u.telephone)}</span></td>
                  <td><span class="tiny">${esc(u.faculte || "—")}</span></td>
                  <td>${u.fichesLues}</td>
                  <td>${u.bloque ? `<span class="tag tag-gris">Suspendu</span>` : `<span class="tag tag-vert">Actif</span>`}</td>
                  <td>
                    ${u.role === "admin" ? "—" : `
                      <button class="btn btn-quiet btn-sm" data-block="${esc(u.id)}">${u.bloque ? "Réactiver" : "Suspendre"}</button>
                      <button class="btn btn-quiet btn-sm" data-link="${esc(u.id)}">Lien de mot de passe</button>`}
                  </td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div id="admin-link" class="stack" style="margin-top:14px"></div>
      </section>
    </div>`;

    $("#annonce-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      try {
        await api("/admin/announcements", {
          method: "POST",
          body: { titre: formValue(form, "titre"), texte: formValue(form, "texte") }
        });
        toast("Annonce publiée.");
        renderAdmin();
      } catch (e) { toast(e.message); }
    });

    $$("[data-del-ann]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        await api("/admin/announcements/" + btn.dataset.delAnn, { method: "DELETE" });
        toast("Annonce supprimée.");
        renderAdmin();
      } catch (e) { toast(e.message); }
    }));

    $$("[data-block]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        const { bloque } = await api(`/admin/users/${btn.dataset.block}/blocage`, { method: "POST" });
        toast(bloque ? "Compte suspendu." : "Compte réactivé.");
        renderAdmin();
      } catch (e) { toast(e.message); }
    }));

    $$("[data-link]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        const { link, email } = await api(`/admin/users/${btn.dataset.link}/reset-link`, { method: "POST" });
        $("#admin-link").innerHTML = `<div class="card card-pad">
          <p class="tiny">Lien de réinitialisation pour ${esc(email)} — valable 30 minutes</p>
          <p style="word-break:break-all;font-size:13px" id="reset-link-text">${esc(link)}</p>
          <button class="btn btn-quiet btn-sm" id="copy-link">Copier</button>
        </div>`;
        $("#copy-link").addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(link); toast("Lien copié."); }
          catch (_) { toast("Sélectionnez le lien pour le copier."); }
        });
      } catch (e) { toast(e.message); }
    }));
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ---------------------------------------------------------
   Profil
   --------------------------------------------------------- */

function renderProfile() {
  const u = state.user;
  setTitle("Mon profil", "Informations personnelles et mot de passe");
  const view = $("#view");

  view.innerHTML = `<div class="grid grid-2">
    <section class="card card-pad">
      <div class="row" style="gap:14px;align-items:center">
        <span class="avatar" style="width:54px;height:54px;font-size:19px">${esc(initials(u))}</span>
        <div>
          <h3 class="card-title">${esc(u.prenom)} ${esc(u.nom)}</h3>
          <p class="tiny">${u.role === "admin" ? "Administrateur" : "Étudiant"} · ${esc(u.promotion || "—")}</p>
        </div>
      </div>
      <div class="stack" style="margin-top:18px">
        <div class="row" style="justify-content:space-between"><span class="muted">E-mail</span><strong style="font-size:14px">${esc(u.email)}</strong></div>
        <div class="row" style="justify-content:space-between"><span class="muted">Téléphone</span><strong style="font-size:14px">${esc(u.telephone)}</strong></div>
        <div class="row" style="justify-content:space-between"><span class="muted">Faculté</span><strong style="font-size:14px">${esc(u.faculte || "—")}</strong></div>
        <div class="row" style="justify-content:space-between"><span class="muted">Compte créé</span><strong style="font-size:14px">${esc(dayLabel(u.createdAt))}</strong></div>
      </div>
    </section>

    <section class="card card-pad">
      <h3 class="card-title" style="margin-bottom:14px">Modifier mes informations</h3>
      <form id="profile-form" class="stack">
        <label class="field"><span>Faculté</span>
          <select name="faculte">
            <option>UNIKIN — Faculté de Médecine</option>
            <option>UNIKIN — Médecine dentaire</option>
            <option>UNIKIN — Santé publique</option>
            <option>Autre institution</option>
          </select>
        </label>
        <label class="field"><span>Promotion</span>
          <select name="promotion">
            <option>L1</option><option>L2</option><option>L3</option>
            <option>M1</option><option>M2</option><option>Doctorat</option>
          </select>
        </label>
        <hr style="border:0;border-top:1px solid var(--bord);margin:4px 0">
        <label class="field"><span>Nouveau mot de passe <em>(laisser vide pour conserver)</em></span><input type="password" name="motDePasse" autocomplete="new-password"></label>
        <label class="field"><span>Confirmation</span><input type="password" name="confirmation" autocomplete="new-password"></label>
        <div><button class="btn btn-primary" type="submit">Enregistrer</button></div>
      </form>
    </section>
  </div>`;

  const form = $("#profile-form");
  form.elements.namedItem("faculte").value = u.faculte || "UNIKIN — Faculté de Médecine";
  form.elements.namedItem("promotion").value = u.promotion || "L1";

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      const body = { faculte: formValue(form, "faculte"), promotion: formValue(form, "promotion") };
      if (formValue(form, "motDePasse")) {
        body.motDePasse = formValue(form, "motDePasse");
        body.confirmation = formValue(form, "confirmation");
      }
      const { user } = await api("/me", { method: "PATCH", body });
      state.user = user;
      $("#side-role").textContent = user.role === "admin" ? "Administrateur" : user.promotion;
      toast("Profil mis à jour.");
      renderProfile();
    } catch (e) { toast(e.message); }
  });
}

/* ---------------------------------------------------------
   Compteur de messages non lus
   --------------------------------------------------------- */

function startUnreadPolling() {
  const refresh = async () => {
    if (!state.user) return;
    try {
      const { conversations } = await api("/conversations");
      const total = conversations.reduce((n, c) => n + (c.unread || 0), 0);
      state.unread = total;
      const badge = $("#nav-unread");
      if (badge) {
        badge.hidden = total === 0;
        badge.textContent = total > 9 ? "9+" : String(total);
      }
    } catch (_) { /* silencieux */ }
  };
  refresh();
  setInterval(refresh, 20000);
}

/* ---------------------------------------------------------
   Démarrage
   --------------------------------------------------------- */

(async function boot() {
  bindAuth();

  // Lien reçu par e-mail : /?reset=TOKEN
  const params = new URLSearchParams(location.search);
  if (params.get("reset")) {
    state.resetToken = params.get("reset");
    showAuth();
    showAuthPanel("reset");
    return;
  }

  try {
    const { user } = await api("/me");
    state.user = user;
    showApp();
  } catch (_) {
    showAuth();
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();
