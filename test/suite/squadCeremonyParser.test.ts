import * as assert from "assert";
import { buildSquadCeremonyPrompt, parseSquadCeremonies } from "../../src/features/squad/services/squadCeremonyParser";

suite("Unit: squadCeremonyParser (SQD-047)", () => {
  test("parses enabled and disabled ceremonies from markdown sections", () => {
    const ceremonies = parseSquadCeremonies(`# Ceremonies

## Sprint Planning

| Field | Value |
| --- | --- |
| Trigger | manual |
| When | weekly |
| Facilitator | Ralph |
| Participants | Ghost, Link |
| Time budget | 30m |
| Enabled | ✅ yes |

**Agenda:**
1. Review backlog
2. Assign work

## Retrospective

| Field | Value |
| --- | --- |
| Enabled | no |

**Agenda:**
- Wins
- Improvements
`);

    assert.strictEqual(ceremonies.length, 2);
    assert.deepStrictEqual(ceremonies[0], {
      id: "sprint-planning",
      name: "Sprint Planning",
      trigger: "manual",
      when: "weekly",
      facilitator: "Ralph",
      participants: "Ghost, Link",
      timeBudget: "30m",
      enabled: true,
      agenda: ["Review backlog", "Assign work"],
    });
    assert.strictEqual(ceremonies[1].id, "retrospective");
    assert.strictEqual(ceremonies[1].enabled, false);
    assert.deepStrictEqual(ceremonies[1].agenda, ["Wins", "Improvements"]);
  });

  test("skips sections without recognized ceremony fields and keeps ids unique", () => {
    const ceremonies = parseSquadCeremonies(`## Notes

No field table here.

## Demo
| Field | Value |
| --- | --- |
| Enabled | yes |

## Demo
| Field | Value |
| --- | --- |
| Enabled | yes |
`);

    assert.deepStrictEqual(
      ceremonies.map((ceremony) => ceremony.id),
      ["demo", "demo-2"]
    );
  });

  test("builds a Copilot Chat prompt with facilitator, participants and agenda", () => {
    const [ceremony] = parseSquadCeremonies(`## Design Review
| Field | Value |
| --- | --- |
| Facilitator | Morpheus |
| Participants | Ghost |
**Agenda:**
1. Inspect UI`);

    const prompt = buildSquadCeremonyPrompt(ceremony);

    assert.ok(prompt.includes('Run the "Design Review" ceremony defined in .squad/ceremonies.md now'));
    assert.ok(prompt.includes("Facilitator: Morpheus."));
    assert.ok(prompt.includes("Participants: Ghost."));
    assert.ok(prompt.includes("1. Inspect UI"));
  });
});
