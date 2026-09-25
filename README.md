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


CI checkpoint: human approval boundary implemented and exact-intent replay protection covered by tests.
