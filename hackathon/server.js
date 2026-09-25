import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { reasonWithSERV } from "./serv.js";
import { evaluatePolicy } from "./policy.js";
import { McpAssuranceGateway } from "./mcp-gateway.js";
import { ApprovalStore } from "./approval-store.js";
import { AAGate } from "./aagate.js";
import { RestAssuranceAdapter } from "./rest-adapter.js";
import { A2AAssuranceAdapter } from "./a2a-adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const auditEvents = [];
const approvalStore = new ApprovalStore();
const mcpGateway = new McpAssuranceGateway({ approvalStore });
const aagate = new AAGate({ approvalStore });
aagate.registerAdapter("rest", new RestAssuranceAdapter());
const a2aAdapter = new A2AAssuranceAdapter();
aagate.registerAdapter("a2a", a2aAdapter);

function canonicalEvent(event) {
  const { event_hash, ...unsigned } = event;
  return unsigned;
}

function hashEvent(event) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonicalEvent(event)))
    .digest("hex");
}

function recordAudit(event) {
  const previousHash = auditEvents.at(-1)?.event_hash || "GENESIS";
  const enriched = {
    event_id: "evt-" + String(auditEvents.length + 1).padStart(5, "0"),
    timestamp: new Date().toISOString(),
    ...event,
    previous_hash: previousHash
  };
  enriched.event_hash = hashEvent(enriched);
  auditEvents.push(enriched);
  return enriched;
}

function verifyAuditChain() {
  let previousHash = "GENESIS";
  for (const event of auditEvents) {
    if (event.previous_hash !== previousHash) {
      return { verified: false, count: auditEvents.length, invalid_event_id: event.event_id, reason: "Previous-hash link mismatch." };
    }
    if (hashEvent(event) !== event.event_hash) {
      return { verified: false, count: auditEvents.length, invalid_event_id: event.event_id, reason: "Event hash mismatch." };
    }
    previousHash = event.event_hash;
  }
  return { verified: true, count: auditEvents.length, head_hash: previousHash };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 100000) reject(new Error("Request too large."));
    });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch { reject(new Error("Invalid JSON.")); }
    });
    req.on("error", reject);
  });
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/health") {
      return sendJson(res, 200, {
        product: "LOG_ON Assurance Gate",
        serv_configured: Boolean(process.env.SERV_API_KEY),
        model: process.env.SERV_MODEL || "SERV-Standard",
        mcp_gateway: true,
        human_approval: true
      });
    }

    if (req.method === "GET" && req.url === "/api/a2a/agents") {
      return sendJson(res, 200, { agents: a2aAdapter.listAgents() });
    }

    if (req.method === "GET" && req.url === "/api/aagate/adapters") {
      return sendJson(res, 200, { adapters: aagate.listAdapters() });
    }

    if (req.method === "POST" && req.url === "/api/aagate/execute") {
      const body = await readJson(req);
      const agent_id = String(body.agent_id || "demo-agent").trim();
      const adapter = String(body.adapter || "").trim();
      const target = String(body.target || "").trim();
      const args = body.arguments && typeof body.arguments === "object" ? body.arguments : {};
      const approval_id = body.approval_id ? String(body.approval_id).trim() : null;
      if (!adapter || !target) return sendJson(res, 400, { error: "adapter and target are required" });

      const result = await aagate.authorizeAndExecute({
        agent_id,
        adapter,
        target,
        arguments: args,
        approval_id
      });

      let approval_request = null;
      if (result.policy.decision === "ESCALATE" && !approval_id && result.descriptor) {
        approval_request = approvalStore.create({
          agent_id,
          tool_name: adapter + ":" + target,
          arguments: args,
          control: result.descriptor
        });
      }

      const audit = recordAudit({
        product: "LOG_ON Assurance Gate",
        event_type: "AAGATE_EXECUTION",
        agent_id,
        adapter,
        target,
        action: result.descriptor?.action || "UNKNOWN",
        resource: result.descriptor?.resource || "UNKNOWN",
        decision: result.policy.decision,
        executed: result.executed,
        approval_id: approval_id || approval_request?.approval_id || null,
        source: "AAGATE -> deterministic policy -> adapter"
      });

      return sendJson(res, 200, {
        ...result,
        approval_request,
        audit,
        audit_verification: verifyAuditChain()
      });
    }

    if (req.method === "GET" && req.url === "/api/mcp/tools") {
      const tools = await mcpGateway.connect().then(() => mcpGateway.listTools());
      return sendJson(res, 200, { count: tools.length, tools });
    }

    if (req.method === "GET" && req.url === "/api/approvals") {
      return sendJson(res, 200, { approvals: approvalStore.list() });
    }

    const approveMatch = req.url?.match(/^\/api\/approvals\/([^/]+)\/approve$/);
    if (req.method === "POST" && approveMatch) {
      const approval_id = approveMatch[1];
      const body = await readJson(req);
      const approver = String(body.approver || "demo-human-approver").trim();
      const approval = approvalStore.approve(approval_id, approver);
      const audit = recordAudit({
        product: "LOG_ON Assurance Gate",
        event_type: "HUMAN_APPROVAL",
        approval_id,
        decision: "APPROVE",
        source: "human approval boundary"
      });
      return sendJson(res, 200, { approval, audit, audit_verification: verifyAuditChain() });
    }

    if (req.method === "POST" && req.url === "/api/mcp/call") {
      const body = await readJson(req);
      const agent_id = String(body.agent_id || "demo-agent").trim();
      const tool_name = String(body.tool_name || "").trim();
      const args = body.arguments && typeof body.arguments === "object" ? body.arguments : {};
      const approval_id = body.approval_id ? String(body.approval_id).trim() : null;
      if (!tool_name) return sendJson(res, 400, { error: "tool_name is required" });

      const result = await mcpGateway.governAndCall({
        agent_id,
        tool_name,
        arguments: args,
        approval_id
      });

      let approval_request = null;
      if (result.policy.decision === "ESCALATE" && !approval_id && !result.approval_invalid) {
        approval_request = approvalStore.create({
          agent_id,
          tool_name,
          arguments: args,
          control: result.control
        });
      }

      const audit = recordAudit({
        product: "LOG_ON Assurance Gate",
        event_type: "TOOL_INVOCATION",
        agent_id,
        action: result.control?.action || "UNKNOWN",
        tool: tool_name,
        resource: result.control?.resource || "UNKNOWN",
        decision: result.policy.decision,
        executed: result.executed,
        approval_id: approval_id || approval_request?.approval_id || null,
        source: approval_id ? "MCP -> LOG_ON AAGATE -> approval -> execution" : "MCP -> LOG_ON AAGATE -> deterministic policy engine"
      });

      return sendJson(res, 200, {
        ...result,
        approval_request,
        audit,
        audit_verification: verifyAuditChain()
      });
    }

    if (req.method === "GET" && req.url === "/api/audit") {
      return sendJson(res, 200, { count: auditEvents.length, events: auditEvents, verification: verifyAuditChain() });
    }

    if (req.method === "GET" && req.url === "/api/audit/verify") {
      const verification = verifyAuditChain();
      return sendJson(res, verification.verified ? 200 : 409, verification);
    }

    if (req.method === "POST" && req.url === "/api/govern") {
      const body = await readJson(req);
      const userRequest = String(body.request || "").trim();
      if (!userRequest) return sendJson(res, 400, { error: "request is required" });

      const serv = await reasonWithSERV(userRequest);
      const policy = evaluatePolicy(serv);
      const audit = recordAudit({
        product: "LOG_ON Assurance Gate",
        event_type: "REASONING_PROPOSAL",
        agent_id: serv.agent_id,
        action: serv.action,
        tool: serv.tool,
        resource: serv.resource,
        decision: policy.decision,
        source: "SERV -> deterministic policy engine"
      });

      return sendJson(res, 200, {
        serv,
        policy,
        audit,
        audit_verification: verifyAuditChain(),
        principle: "The model may propose. The policy plane decides. The gateway enforces. The assurance plane records."
      });
    }

    return sendFile(res, path.join(publicDir, "index.html"));
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});

server.listen(port, () => console.log("LOG_ON Assurance Gate running on http://localhost:" + port));
process.on("SIGINT", async () => { await mcpGateway.close(); process.exit(0); });
process.on("SIGTERM", async () => { await mcpGateway.close(); process.exit(0); });
