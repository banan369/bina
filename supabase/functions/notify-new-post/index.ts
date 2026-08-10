import { createClient } from "npm:@supabase/supabase-js@2.55.0";
import {
  buildMessage,
  idempotencyKey,
  isSupportedInsert,
  settleDeliveries,
  uniqueRecipients,
} from "./notification.mjs";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

async function listAllUsers(supabase: ReturnType<typeof createClient>) {
  const users = [];
  for (let page = 1;; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

Deno.serve(async (request) => {
  const eventLabel = crypto.randomUUID();
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const webhookSecret = Deno.env.get("BINA_WEBHOOK_SECRET");
  if (!webhookSecret || request.headers.get("x-bina-webhook-secret") !== webhookSecret) {
    console.warn(`[${eventLabel}] Rejected unauthenticated webhook`);
    return json({ error: "unauthorized" }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!isSupportedInsert(payload)) {
    console.warn(`[${eventLabel}] Ignored unsupported webhook payload`);
    return json({ error: "unsupported_event" }, 400);
  }

  const { table, record } = payload;
  if (!record.id || !record.user_id) {
    console.error(`[${eventLabel}] Record is missing id or user_id`, { table });
    return json({ error: "missing_record_identity" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFICATION_FROM_EMAIL");
  if (!supabaseUrl || !serviceRoleKey || !resendKey || !from) {
    console.error(`[${eventLabel}] One or more required server secrets are missing`);
    return json({ error: "server_not_configured" }, 500);
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const recipients = uniqueRecipients(await listAllUsers(supabase), record.user_id);
    if (recipients.length === 0) {
      console.info(`[${eventLabel}] No eligible recipients`, { table, recordId: record.id });
      return json({ sent: 0, failed: 0 });
    }

    const message = buildMessage(table, record);
    const results = await settleDeliveries(recipients, async (user) => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${resendKey}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey(table, record.id, user.id),
        },
        body: JSON.stringify({ from, to: [user.email], subject: message.subject, html: message.html }),
      });
      if (!response.ok) throw new Error(`Resend returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    });

    let failed = 0;
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        failed += 1;
        console.error(`[${eventLabel}] Recipient delivery failed`, {
          recipientId: recipients[index].id,
          reason: String(result.reason),
        });
      }
    });
    const sent = results.length - failed;
    console.info(`[${eventLabel}] Notification run finished`, { table, recordId: record.id, sent, failed });
    return json({ sent, failed }, failed === results.length ? 502 : 200);
  } catch (error) {
    console.error(`[${eventLabel}] Notification run failed`, { table, recordId: record.id, error: String(error) });
    return json({ error: "notification_failed" }, 500);
  }
});
