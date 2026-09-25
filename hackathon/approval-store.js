import crypto from "node:crypto";

function canonical(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => [key, canonical(val)])
  );
}

export function intentHash(intent) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(intent)))
    .digest("hex");
}

export class ApprovalStore {
  constructor({ ttlMs = 5 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.items = new Map();
    this.sequence = 0;
  }

  create({ agent_id, tool_name, arguments: args, control }) {
    const now = Date.now();
    const intent = {
      agent_id,
      tool_name,
      arguments: args || {},
      action: control.action,
      resource: control.resource
    };
    const approval_id = "apr-" + String(++this.sequence).padStart(5, "0");
    const item = {
      approval_id,
      status: "PENDING",
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + this.ttlMs).toISOString(),
      intent,
      intent_hash: intentHash(intent)
    };
    this.items.set(approval_id, item);
    return item;
  }

  get(approval_id) {
    return this.items.get(approval_id) || null;
  }

  list() {
    return [...this.items.values()];
  }

  approve(approval_id, approver = "demo-approver") {
    const item = this.get(approval_id);
    if (!item) throw new Error("Approval not found.");
    if (item.status !== "PENDING") throw new Error("Approval is not pending.");
    if (Date.parse(item.expires_at) <= Date.now()) {
      item.status = "EXPIRED";
      throw new Error("Approval has expired.");
    }
    item.status = "APPROVED";
    item.approved_at = new Date().toISOString();
    item.approved_by = approver;
    return item;
  }

  validate(approval_id, intent) {
    const item = this.get(approval_id);
    if (!item) return { valid: false, reason: "Approval not found." };
    if (item.status !== "APPROVED") return { valid: false, reason: "Approval is not approved." };
    if (Date.parse(item.expires_at) <= Date.now()) {
      item.status = "EXPIRED";
      return { valid: false, reason: "Approval has expired." };
    }
    const actual = intentHash(intent);
    if (actual !== item.intent_hash) {
      return { valid: false, reason: "Approval does not match this exact action intent." };
    }
    return { valid: true, approval: item };
  }
}
