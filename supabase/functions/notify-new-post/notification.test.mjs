import assert from "node:assert/strict";
import test from "node:test";
import { buildMessage, idempotencyKey, isSupportedInsert, settleDeliveries, uniqueRecipients } from "./notification.mjs";

test("accepts only request and offer INSERT webhooks", () => {
  for (const table of ["requests", "offers"]) assert.equal(isSupportedInsert({ type: "INSERT", schema: "public", table, record: {} }), true);
  assert.equal(isSupportedInsert({ type: "UPDATE", schema: "public", table: "requests", record: {} }), false);
});

test("builds safe, table-specific messages with optional fields", () => {
  const request = buildMessage("requests", { title: "<طلب>", description: "وصف", city: "جدة", category: "تعليم" });
  assert.equal(request.subject, "طلب مساعدة جديد في بينا");
  assert.match(request.html, /&lt;طلب&gt;/);
  assert.match(request.html, /جدة/);
  const offer = buildMessage("offers", { title: "دروس" });
  assert.equal(offer.subject, "عرض مساعدة جديد في بينا");
  assert.doesNotMatch(offer.html, /المدينة:/);
});

test("excludes owner, invalid email, and duplicate address", () => {
  const users = [
    { id: "owner", email: "owner@example.com" }, { id: "one", email: "ONE@example.com" },
    { id: "two", email: "one@example.com" }, { id: "bad", email: "invalid" },
  ];
  assert.deepEqual(uniqueRecipients(users, "owner").map((user) => user.id), ["one"]);
  assert.deepEqual(uniqueRecipients([{ id: "owner", email: "owner@example.com" }], "owner"), []);
});

test("uses a stable event/recipient idempotency key", () => {
  assert.equal(idempotencyKey("requests", "post-1", "user-1"), idempotencyKey("requests", "post-1", "user-1"));
  assert.notEqual(idempotencyKey("requests", "post-1", "user-1"), idempotencyKey("requests", "post-1", "user-2"));
});

test("continues delivery after one recipient fails", async () => {
  const attempted = [];
  const results = await settleDeliveries([{ id: "ok-1" }, { id: "bad" }, { id: "ok-2" }], async (user) => {
    attempted.push(user.id);
    if (user.id === "bad") throw new Error("Resend failure");
  });
  assert.deepEqual(attempted, ["ok-1", "bad", "ok-2"]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected", "fulfilled"]);
});
