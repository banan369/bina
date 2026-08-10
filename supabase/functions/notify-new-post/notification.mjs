export const SITE_URL = "https://banan369.github.io/bina/";

export function isSupportedInsert(payload) {
  return payload?.type === "INSERT" && payload?.schema === "public" &&
    (payload?.table === "requests" || payload?.table === "offers") &&
    payload.record && typeof payload.record === "object";
}

export function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function uniqueRecipients(users, ownerId) {
  const seen = new Set();
  return users.filter((user) => {
    const email = user.email?.trim().toLowerCase();
    if (user.id === ownerId || !isValidEmail(email) || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortDescription(value, limit = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function buildMessage(table, record) {
  const request = table === "requests";
  const heading = request ? "طلب مساعدة جديد في بينا" : "عرض مساعدة جديد في بينا";
  const title = String(record.title ?? "بدون عنوان").trim() || "بدون عنوان";
  const description = shortDescription(record.description) || "لا يوجد وصف.";
  const optional = [
    record.city ? `<p><strong>المدينة:</strong> ${escapeHtml(record.city)}</p>` : "",
    record.category ? `<p><strong>التصنيف:</strong> ${escapeHtml(record.category)}</p>` : "",
  ].join("");

  return {
    subject: heading,
    html: `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:Arial,sans-serif;line-height:1.7;color:#292524"><h1>${heading}</h1><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>${optional}<p><a href="${SITE_URL}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:white;text-decoration:none;border-radius:8px">افتح موقع بينا</a></p></body></html>`,
  };
}

export function idempotencyKey(table, recordId, userId) {
  return `bina-${table}-${recordId}-${userId}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 256);
}

export async function settleDeliveries(recipients, deliver) {
  return await Promise.allSettled(recipients.map(deliver));
}
