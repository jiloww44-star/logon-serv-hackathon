import { intentHash } from "./approval-store.js";
import { evaluatePolicy } from "./policy.js";

export class AAGate {
  constructor({ approvalStore }) {
    this.approvalStore = approvalStore;
    this.adapters = new Map();
  }

  registerAdapter(name, adapter) {
    if (this.adapters.has(name)) throw new Error("Adapter already registered: " + name);
    if (!adapter || typeof adapter.describe !== "function" || typeof adapter.execute !== "function") {
      throw new TypeError("Adapter must implement describe() and execute().");
    }
    this.adapters.set(name, adapter);
  }

  listAdapters() {
    return [...this.adapters.keys()];
  }

  async authorizeAndExecute({ agent_id, adapter, target, arguments: args = {}, approval_id = null }) {
    const impl = this.adapters.get(adapter);
    if (!impl) {
      return {
        executed: false,
        policy: {
          decision: "BLOCK",
          reasons: ["Execution adapter is not registered."],
          controls: {
            identity: Boolean(agent_id),
            permissions: false,
            tools: false,
            data_access: false,
            runtime: false,
            approval: true,
            audit: true
          }
        }
      };
    }

    const descriptor = await impl.describe({ target, arguments: args });
    const policy = evaluatePolicy({
      agent_id,
      action: descriptor.action,
      tool: adapter + ":" + target,
      resource: descriptor.resource,
      data_class: descriptor.data_class,
      environment: descriptor.environment,
      external_side_effect: descriptor.external_side_effect
    });

    const intent = {
      agent_id,
      adapter,
      target,
      arguments: args || {},
      action: descriptor.action,
      resource: descriptor.resource
    };

    if (policy.decision === "BLOCK") {
      return { executed: false, adapter, target, descriptor, policy };
    }

    if (policy.decision === "ESCALATE") {
      if (!approval_id) {
        return {
          executed: false,
          approval_required: true,
          adapter,
          target,
          descriptor,
          policy,
          intent_hash: intentHash(intent)
        };
      }

      const validation = this.approvalStore?.validate(approval_id, {
        agent_id,
        tool_name: adapter + ":" + target,
        arguments: args || {},
        action: descriptor.action,
        resource: descriptor.resource
      });

      if (!validation?.valid) {
        return {
          executed: false,
          approval_required: true,
          approval_invalid: true,
          approval_reason: validation?.reason || "Approval store unavailable.",
          adapter,
          target,
          descriptor,
          policy
        };
      }

      policy.decision = "PASS";
      policy.reasons = ["Independent human approval verified for the exact action intent."];
      policy.controls = { ...policy.controls, approval: true };
    }

    const result = await impl.execute({ target, arguments: args });
    return {
      executed: true,
      approved: Boolean(approval_id),
      approval_id: approval_id || null,
      adapter,
      target,
      descriptor,
      intent_hash: intentHash(intent),
      policy,
      result
    };
  }
}
