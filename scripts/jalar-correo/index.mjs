// Jalador de facturas del correo -> ERP. Corre en GitHub Actions cada X minutos.
// 1) Le pregunta al ERP qué remitentes están ACTIVOS y desde qué fecha.
// 2) Lee el buzón (IMAP), busca correos de esos remitentes con XML adjuntos.
// 3) Manda los XML al ERP (/api/ingesta), que crea la factura en BORRADOR.
// 4) Etiqueta el correo como procesado (label ERP_JALADO) para no repetirlo.
// Idempotente: el ERP deduplica por clave, así que reenviar no crea duplicados.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import AdmZip from "adm-zip";

const ERP = process.env.ERP_URL || "https://erp-chepito.netlify.app";
const TOKEN = process.env.INGESTA_TOKEN;
const USER = process.env.GMAIL_USER;
const PASS = process.env.GMAIL_APP_PASSWORD;
const LABEL = "ERP_JALADO";

if (!TOKEN || !USER || !PASS) {
  // Todavía no están los secretos (GMAIL_APP_PASSWORD / INGESTA_TOKEN). Salimos
  // limpio para que las corridas programadas no marquen error antes del setup.
  console.log("Faltan secretos (GMAIL_APP_PASSWORD / INGESTA_TOKEN). Configuralos en GitHub → Settings → Secrets. Sin hacer nada por ahora.");
  process.exit(0);
}

const headers = { "content-type": "application/json", "x-ingesta-token": TOKEN };

function xmlsDeAdjuntos(attachments = []) {
  const xmls = [];
  for (const att of attachments) {
    const name = (att.filename || "").toLowerCase();
    const buf = att.content;
    if (!buf) continue;
    if (name.endsWith(".xml")) {
      xmls.push(buf.toString("utf8"));
    } else if (name.endsWith(".zip")) {
      try {
        for (const e of new AdmZip(buf).getEntries()) {
          if (e.entryName.toLowerCase().endsWith(".xml")) xmls.push(e.getData().toString("utf8"));
        }
      } catch (e) {
        console.warn("  zip ilegible:", e.message);
      }
    }
  }
  return xmls;
}

async function main() {
  // 1) fuentes activas
  const fRes = await fetch(`${ERP}/api/ingesta/fuentes`, { headers });
  if (!fRes.ok) throw new Error(`No pude leer fuentes: HTTP ${fRes.status}`);
  const { fuentes } = await fRes.json();
  console.log(`Remitentes activos: ${fuentes.length}`);
  if (fuentes.length === 0) return;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: USER, pass: PASS },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  let totalOk = 0;
  try {
    for (const f of fuentes) {
      const since = new Date(f.desde + "T00:00:00Z");
      let uids = [];
      try {
        uids = await client.search({ from: f.remitente, since }, { uid: true });
      } catch (e) {
        console.warn(`  búsqueda falló (${f.remitente}): ${e.message}`);
      }
      if (!uids || uids.length === 0) {
        console.log(`  ${f.etiqueta}: sin correos nuevos.`);
        continue;
      }
      let ok = 0;
      for await (const msg of client.fetch(uids, { uid: true, flags: true, source: true })) {
        if (msg.flags && msg.flags.has(LABEL)) continue; // ya procesado
        let xmls = [];
        try {
          const parsed = await simpleParser(msg.source);
          xmls = xmlsDeAdjuntos(parsed.attachments);
        } catch (e) {
          console.warn("  no pude parsear el correo:", e.message);
          continue;
        }
        if (xmls.length === 0) continue;
        const pRes = await fetch(`${ERP}/api/ingesta`, {
          method: "POST",
          headers,
          body: JSON.stringify({ xmls }),
        });
        if (pRes.ok) {
          ok++;
          totalOk++;
          try {
            await client.messageFlagsAdd(msg.uid, [LABEL], { uid: true });
          } catch {
            /* si Gmail no acepta el keyword, igual el ERP deduplica por clave */
          }
        } else {
          console.warn(`  /api/ingesta HTTP ${pRes.status}: ${(await pRes.text()).slice(0, 200)}`);
        }
      }
      console.log(`  ${f.etiqueta}: ${ok} facturas ingresadas.`);
      // marca último jalado
      await fetch(`${ERP}/api/ingesta/fuentes`, {
        method: "POST",
        headers,
        body: JSON.stringify({ remitente: f.remitente }),
      }).catch(() => {});
    }
  } finally {
    lock.release();
    await client.logout();
  }
  console.log(`Listo. Total ingresadas: ${totalOk}.`);
}

main().catch((e) => {
  console.error("FALLÓ el jalador:", e.message);
  process.exit(1);
});
