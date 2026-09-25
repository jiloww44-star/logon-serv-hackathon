const AGENTS = {
  "research-agent": {
    protocolVersion: "1.0",
    name: "Research Agent",
    description: "Simulated remote agent for public research tasks.",
    url: "https://example.invalid/a2a/research",
    transport: "JSONRPC",
    skills: ["public-market-research"],
    governance: {
      allowedActions: ["READ"],
      resources: ["market:public"],
      dataClasses: ["PUBLIC"],
      environment: "DEVELOPMENT"
    }
  },
  "operations-agent": {
    protocolVersion: "1.0",
    name: "Operations Agent",
    description: "Simulated remote agent for production operations.",
    url: "https://example.invalid/a2a/operations",
    transport: "JSONRPC",
    skills: ["crm-update"],
    governance: {
      allowedActions: ["UPDATE"],
      resources: ["crm:customer"],
      dataClasses: ["INTERNAL"],
      environment: "PRODUCTION"
    }
  }
};

export class A2AAssuranceAdapter {
  listAgents() {
    return Object.entries(AGENTS).map(([agentId, card]) => ({
      agentId,
      ...card
    }));
  }

  getAgentCard(agentId) {
    return AGENTS[agentId] ? { agentId, ...AGENTS[agentId] } : null;
  }

  async describe({ target, arguments: args = {} }) {
    const card = AGENTS[target];
    if (!card) throw new Error("Unknown A2A agent: " + target);

    const governance = card.governance;
    const requestedAction = String(args.action || governance.allowedActions[0]);
    const requestedResource = String(args.resource || governance.resources[0]);

    if (!governance.allowedActions.includes(requestedAction)) {
      return {
        action: "ADMIN",
        resource: requestedResource,
        data_class: "RESTRICTED",
        environment: "PRODUCTION",
        external_side_effect: true,
        delegation_rejected: true,
        reason: "Requested action is outside the remote agent's declared capability."
      };
    }

    if (!governance.resources.includes(requestedResource)) {
      return {
        action: "ADMIN",
        resource: requestedResource,
        data_class: "RESTRICTED",
        environment: "PRODUCTION",
        external_side_effect: true,
        delegation_rejected: true,
        reason: "Requested resource is outside the remote agent's declared scope."
      };
    }

    return {
      action: requestedAction,
      resource: requestedResource,
      data_class: governance.dataClasses[0],
      environment: governance.environment,
      external_side_effect: governance.environment === "PRODUCTION",
      delegation_rejected: false,
      agent_card: card
    };
  }

  async execute({ target, arguments: args = {} }) {
    const card = AGENTS[target];
    return {
      protocol: "A2A",
      protocolVersion: card.protocolVersion,
      method: "message/send",
      remoteAgent: target,
      task: {
        id: "task-" + cryptoRandomId(),
        state: "COMPLETED",
        message: String(args.message || "Governed delegated task")
      },
      simulated: true,
      result: "SIMULATED_A2A_TASK_EXECUTED"
    };
  }
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 10);
}
