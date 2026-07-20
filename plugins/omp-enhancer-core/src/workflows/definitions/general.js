export const generalWorkflows = [
  {
    "id": "agentic.simple",
    "delegationDefault": "direct-simple",
    "chooseWhen": "Only when no specialized card adds material method, evidence, preservation, risk, format, or delegation; target size alone never qualifies.",
    "composeWith": [],
    "steps": [
      {
        "id": "step-1",
        "text": "Understand the outcome and inspect minimal context."
      },
      {
        "id": "step-2",
        "text": "Perform the requested work."
      },
      {
        "id": "step-3",
        "text": "Verify proportionally and respond."
      }
    ],
    "scopeNotes": [
      "No specialized workflow is inferred."
    ],
    "skills": [],
    "qualityChecks": [
      "requested outcome, scope, and factual consistency"
    ],
    "riskNotes": [],
    "roles": [],
    "delegation": [
      "step-1: keep this workflow with the main agent; compose a specialized workflow before delegating any independent checkpoint"
    ]
  }
];
