/* =========================================================
   Envoi d'e-mail sans dépendance (SMTP avec STARTTLS)
   Configuration par variables d'environnement :
     SMTP_HOST  (ex. smtp.gmail.com)
     SMTP_PORT  (587 par défaut, 465 pour TLS direct)
     SMTP_USER  / SMTP_PASS
     SMTP_FROM  (ex. "MEDMOLA UNIKIN <no-reply@medmola.cd>")
     APP_URL    (ex. https://medmola.cd) — sert à construire le lien
   Si rien n'est configuré, le serveur bascule en mode console.
   ========================================================= */

const net = require("node:net");
const tls = require("node:tls");
const crypto = require("node:crypto");

const cfg = () => ({
  host: process.env.SMTP_HOST || "",
  port: Number(process.env.SMTP_PORT || 587),
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
  from: process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@localhost",
  appUrl: (process.env.APP_URL || "http://localhost:" + (process.env.PORT || 3000)).replace(/\/$/, "")
});

const isConfigured = () => Boolean(cfg().host && cfg().user && cfg().pass);

/* --- petite machine à états SMTP --- */

function createSession(socket) {
  let buffer = "";
  const waiters = [];

  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const match = /^(\d{3})([ -])(.*)$/.exec(line);
      if (!match) continue;
      const waiter = waiters[0];
      if (waiter) {
        waiter.lines.push({ code: Number(match[1]), text: match[3] });
        if (match[2] === " " || Number(match[1]) >= 400) {
          waiters.shift();
          waiter.resolve(waiter.lines);
        }
      }
    }
  });

  return {
    read(timeout = 15000) {
      return new Promise((resolve, reject) => {
        const entry = { lines: [], resolve };
        waiters.push(entry);
        const timer = setTimeout(() => {
          const index = waiters.indexOf(entry);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("SMTP : délai dépassé"));
        }, timeout);
        const done = entry.resolve;
        entry.resolve = (value) => {
          clearTimeout(timer);
          done(value);
        };
      });
    },
    write(data) {
      socket.write(data + "\r\n");
    }
  };
}

function upgrade(socket, host) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host }, () => resolve(secure));
    secure.once("error", reject);
  });
}

async function sendMail({ to, subject, text }) {
  const c = cfg();
  if (!isConfigured()) return { sent: false, reason: "smtp-non-configure" };

  const secureFromStart = c.port === 465;
  const socket = secureFromStart
    ? tls.connect({ host: c.host, port: c.port, servername: c.host })
    : net.connect({ host: c.host, port: c.port });

  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
    socket.setTimeout(20000, () => reject(new Error("SMTP : connexion expirée")));
  });

  let session = createSession(socket);
  const expect = async (codes, label) => {
    const lines = await session.read();
    const code = lines[lines.length - 1].code;
    if (!codes.includes(code)) {
      throw new Error(`SMTP ${label} : ${code} ${lines[lines.length - 1].text}`);
    }
    return lines;
  };

  try {
    await expect([220], "accueil");
    session.write(`EHLO ${c.host}`);
    await expect([250], "EHLO");

    if (!secureFromStart) {
      session.write("STARTTLS");
      await expect([220], "STARTTLS");
      socket.removeAllListeners("data");
      const secure = await upgrade(socket, c.host);
      session = createSession(secure);
      session.write(`EHLO ${c.host}`);
      await expect([250], "EHLO TLS");
    }

    session.write("AUTH LOGIN");
    await expect([334], "AUTH");
    session.write(Buffer.from(c.user).toString("base64"));
    await expect([334], "utilisateur");
    session.write(Buffer.from(c.pass).toString("base64"));
    await expect([235], "mot de passe");

    session.write(`MAIL FROM:<${(c.from.match(/<(.+)>/) || [, c.from])[1]}>`);
    await expect([250], "MAIL FROM");
    session.write(`RCPT TO:<${to}>`);
    await expect([250, 251], "RCPT TO");
    session.write("DATA");
    await expect([354], "DATA");

    const body = Buffer.from(text, "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      .join("\r\n");

    const message = [
      `From: ${c.from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      `Message-ID: <${crypto.randomUUID()}@${c.host}>`,
      "",
      body
    ].join("\r\n");

    session.write(message + "\r\n.");
    await expect([250], "envoi");
    session.write("QUIT");

    return { sent: true };
  } finally {
    socket.end();
  }
}

function resetLink(token) {
  const base = cfg().appUrl;
  return `${base}/?reset=${encodeURIComponent(token)}`;
}

function resetEmailText(prenom, link) {
  return [
    `Bonjour ${prenom},`,
    "",
    "Vous avez demandé la réinitialisation de votre mot de passe sur MEDMOLA UNIKIN.",
    "",
    "Ouvrez ce lien pour choisir un nouveau mot de passe (valable 30 minutes, utilisable une seule fois) :",
    link,
    "",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
    "",
    "— MEDMOLA UNIKIN, Faculté de Médecine"
  ].join("\r\n");
}

module.exports = { sendMail, isConfigured, resetLink, resetEmailText, cfg };
