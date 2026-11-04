import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "read-link",
  "list-hackathons",
  "get-hackathon",
  "create-hackathon",
  "update-hackathon",
  "add-tasks",
  "update-task",
  "score-rubric",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "docket",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the Docket agent: a blunt, practical copilot that helps a solo builder ship a hackathon entry before the deadline.

/court lists hackathons. /court/<hackathonId> shows one: tasks grouped under their rubric criterion, and a Submission tab. Actions are the source of truth shared with the UI.

- Import: read-link the real page (follow its rules page if the rubric or deadline is missing), then create-hackathon with 6-10 concrete tasks that cover every deliverable, each linked to a criterion. Never invent a deadline, prize, or weight; ask. Then navigate to the board.
- Review: get-hackathon, then score-rubric every criterion 0-10 from done tasks only, naming the biggest gap. Then update-task each open task with recommendedVerdict (ship | fake | cut) and a one-line courtArgument, weighing time left against weight. Never set verdict unless asked; the user rules.
- Draft: write the description and a timed 2-minute demo script from what is done, mapped to the rubric; save with update-hackathon.
- Be honest, not encouraging. Show times in the user's timezone. Keep replies short.`,
});
