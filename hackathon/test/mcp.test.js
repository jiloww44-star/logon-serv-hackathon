import test from "node:test";
import assert from "node:assert/strict";
import { McpAssuranceGateway } from "../mcp-gateway.js";
import { ApprovalStore } from "../approval-store.js";

test("MCP read tool executes only after LOG_ON allows it", async () => {
  const gateway = new McpAssuranceGateway();
  try {
    const tools = await gateway.connect().then(() => gateway.listTools());
    assert.equal(tools.length, 4);
    const read = await gateway.governAndCall({
      agent_id: "demo-agent",
      tool_name: "market_data_read",
      arguments: { query: "AI infrastructure" }
    });
    assert.equal(read.policy.decision, "PASS");
    assert.equal(read.executed, true);
    assert.match(read.result.content[0].text, /SIMULATED_PUBLIC_MARKET_DATA/);
  } finally {
    await gateway.close();
  }
});

test("MCP production write requires approval and does not execute before approval", async () => {
  const approvalStore = new ApprovalStore();
  const gateway = new McpAssuranceGateway({ approvalStore });
  const args = { customerId: "C-1", field: "status", value: "approved" };
  try {
    const held = await gateway.governAndCall({
      agent_id: "demo-agent",
      tool_name: "production_crm_update",
      arguments: args
    });
    assert.equal(held.policy.decision, "ESCALATE");
    assert.equal(held.executed, false);
    const approval = approvalStore.create({
      agent_id: "demo-agent",
      tool_name: "production_crm_update",
      arguments: args,
      control: held.control
    });
    assert.equal(approval.status, "PENDING");
    approvalStore.approve(approval.approval_id, "tester");
    const approved = await gateway.governAndCall({
      agent_id: "demo-agent",
      tool_name: "production_crm_update",
      arguments: args,
      approval_id: approval.approval_id
    });
    assert.equal(approved.policy.decision, "PASS");
    assert.equal(approved.executed, true);
    assert.equal(approved.approved, true);
  } finally {
    await gateway.close();
  }
});

test("approval cannot be replayed for a different exact intent", async () => {
  const approvalStore = new ApprovalStore();
  const gateway = new McpAssuranceGateway({ approvalStore });
  const args = { customerId: "C-1", field: "status", value: "approved" };
  try {
    const held = await gateway.governAndCall({
      agent_id: "demo-agent",
      tool_name: "production_crm_update",
      arguments: args
    });
    const approval = approvalStore.create({
      agent_id: "demo-agent",
      tool_name: "production_crm_update",
      arguments: args,
      control: held.control
    });
    approvalStore.approve(approval.approval_id, "tester");

    const replay = await gateway.governAndCall({
      agent_id: "demo-agent",
      tool_name: "production_crm_update",
      arguments: { ...args, value: "rejected" },
      approval_id: approval.approval_id
    });

    assert.equal(replay.executed, false);
    assert.equal(replay.approval_invalid, true);
    assert.match(replay.approval_reason, /exact action intent/);
  } finally {
    await gateway.close();
  }
});

test("MCP admin grant is blocked before approval can matter", async () => {
  const approvalStore = new ApprovalStore();
  const gateway = new McpAssuranceGateway({ approvalStore });
  try {
    const result = await gateway.governAndCall({
      agent_id: "demo-agent",
      tool_name: "grant_admin_access",
      arguments: { principal: "demo-agent" }
    });
    assert.equal(result.policy.decision, "BLOCK");
    assert.equal(result.executed, false);
  } finally {
    await gateway.close();
  }
});
