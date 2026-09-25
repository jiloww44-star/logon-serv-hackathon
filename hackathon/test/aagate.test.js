import test from "node:test";
import assert from "node:assert/strict";
import { AAGate } from "../aagate.js";
import { ApprovalStore } from "../approval-store.js";
import { RestAssuranceAdapter } from "../rest-adapter.js";

test("AAGATE passes a safe REST read", async () => {
  const gate = new AAGate({ approvalStore: new ApprovalStore() });
  gate.registerAdapter("rest", new RestAssuranceAdapter());

  const result = await gate.authorizeAndExecute({
    agent_id: "demo-agent",
    adapter: "rest",
    target: "market-read",
    arguments: { symbol: "AAPL" }
  });

  assert.equal(result.policy.decision, "PASS");
  assert.equal(result.executed, true);
  assert.equal(result.result.transport, "REST");
});

test("AAGATE stops a production REST update pending approval", async () => {
  const gate = new AAGate({ approvalStore: new ApprovalStore() });
  gate.registerAdapter("rest", new RestAssuranceAdapter());

  const result = await gate.authorizeAndExecute({
    agent_id: "demo-agent",
    adapter: "rest",
    target: "production-crm-update",
    arguments: { customerId: "C-1", field: "status", value: "approved" }
  });

  assert.equal(result.policy.decision, "ESCALATE");
  assert.equal(result.executed, false);
  assert.equal(result.approval_required, true);
});

test("AAGATE executes the same REST intent after approval", async () => {
  const approvals = new ApprovalStore();
  const gate = new AAGate({ approvalStore: approvals });
  gate.registerAdapter("rest", new RestAssuranceAdapter());

  const args = { customerId: "C-1", field: "status", value: "approved" };
  const held = await gate.authorizeAndExecute({
    agent_id: "demo-agent",
    adapter: "rest",
    target: "production-crm-update",
    arguments: args
  });

  const approval = approvals.create({
    agent_id: "demo-agent",
    tool_name: "rest:production-crm-update",
    arguments: args,
    control: {
      action: "UPDATE",
      resource: "crm:customer"
    }
  });
  approvals.approve(approval.approval_id, "tester");

  const executed = await gate.authorizeAndExecute({
    agent_id: "demo-agent",
    adapter: "rest",
    target: "production-crm-update",
    arguments: args,
    approval_id: approval.approval_id
  });

  assert.equal(held.executed, false);
  assert.equal(executed.policy.decision, "PASS");
  assert.equal(executed.executed, true);
});

test("unknown execution adapter is blocked", async () => {
  const gate = new AAGate({ approvalStore: new ApprovalStore() });
  const result = await gate.authorizeAndExecute({
    agent_id: "demo-agent",
    adapter: "browser",
    target: "checkout",
    arguments: {}
  });
  assert.equal(result.policy.decision, "BLOCK");
  assert.equal(result.executed, false);
});
