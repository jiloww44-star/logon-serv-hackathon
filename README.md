# logon-serv-hackathon

LOG_ON Governance + Agent Assurance — SERV Hackathon Edition.

## Core demo

```text
agent request
→ SERV reasoning
→ structured action proposal
→ deterministic LOG_ON policy
→ PASS / ESCALATE / BLOCK
→ MCP execution only when authorized
→ audit evidence
→ audit-chain verification
```

## Repository structure

- `hackathon/` — SERV-facing MVP, frontend, backend, policy engine and MCP assurance gateway
- `logon-agent-economy/` — governance/control-plane reference implementation and Agent Economy adapters
- `docs/` — research and market-gap material
- `.github/workflows/` — automated tests

The primary product identity is **Governance + Agent Assurance**. The Agent Economy is a governed deployment environment, not the product identity.

No production payment settlement, enterprise identity provider, compliance certification or production MCP deployment is claimed by this repository.


## A2A governance boundary

A2A is implemented as a governed adapter behind AAGATE. The adapter models Agent Cards, declared skills, child-agent action/resource scope, and delegated task execution. LOG_ON evaluates the delegation before any simulated remote-agent execution.

The implementation follows the current A2A v1.0 concepts of Agent Cards and Tasks and treats remote-agent capability declarations as discovery inputs rather than authorization. The A2A protocol itself does not replace LOG_ON policy. See https://a2a-protocol.org/v1.0.0/

Current demo agents:
- research-agent — public read workload
- operations-agent — production CRM update workload

Demo behavior:
- research delegation → PASS → delegated task executes
- production delegation → ESCALATE → human approval required
- delegation outside the child agent's declared scope → BLOCK

The current A2A adapter is a governance/execution pattern for the hackathon, not a claim of full production A2A conformance.
