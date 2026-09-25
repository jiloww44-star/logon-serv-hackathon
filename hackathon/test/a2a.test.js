import test from "node:test";
import assert from "node:assert/strict";
import { AAGate } from "../aagate.js";
import { ApprovalStore } from "../approval-store.js";
import { A2AAssuranceAdapter } from "../a2a-adapter.js";

test("AAGATE discovers governed A2A agents", async () => {
  const adapter = new A2AAssuranceAdapter();
  const agents = adapter.listAgents();
  assert.equal(agents.length, 2);
  assert.equal(adapter.getAgentCard("research-agent").protocolVersion, "1.0");
});

test("AAGATE permits a safe A2A research delegation", async () => {
  const gate = new AAGate({ approvalStore: new ApprovalStore() });
  gate.registerAdapter("a2a", new A2AAssuranceAdapter());

  const result = await gate.authorizeAndExecute({
    agent_id: "parent-agent",
    adapter: "a2a",
    target: "research-agent",
    arguments: {
      action: "READ",
      resource: "market:public",
      message: "Research public market data."
    }
  });

  assert.equal(result.policy.decision, "PASS");
  assert.equal(result.executed, true);
  assert.equal(result.result.protocol, "A2A");
});

test("A2A production delegation escalates before remote execution", async () => {
  const gate = new AAGate({ approvalStore: new ApprovalStore() });
  gate.registerAdapter("a2a", new A2AAssuranceAdapter());

  const result = await gate.authorizeAndExecute({
    agent_id: "parent-agent",
    adapter: "a2a",
    target: "operations-agent",
    arguments: {
      action: "UPDATE",
      resource: "crm:customer",
      message: "Update production customer."
    }
  });

  assert.equal(result.policy.decision, "ESCALATE");
  assert.equal(result.executed, false);
  assert.equal(result.approval_required, true);
});

test("A2A delegation outside declared child scope is blocked", async () => {
  const gate = new AAGate({ approvalStore: new ApprovalStore() });
  gate.registerAdapter("a2a", new A2AAssuranceAdapter());

  const result = await gate.authorizeAndExecute({
    agent_id: "parent-agent",
    adapter: "a2a",
    target: "research-agent",
    arguments: {
      action: "DELETE",
      resource: "market:public",
      message: "Delete market data."
    }
  });

  assert.equal(result.policy.decision, "BLOCK");
  assert.equal(result.executed, false);
});
