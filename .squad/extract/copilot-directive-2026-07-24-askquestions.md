# Directive — use askQuestions for discovery questions

**Date:** 2026-07-24
**Source:** Eric Decarufel (captured via Copilot)
**Classification:** Generic — agent interaction pattern

## Directive

When an agent needs to ask the user discovery or clarification questions, use the `askQuestions` tool with selectable options rather than asking free-form questions in chat prose.

## Guidance

- Provide selectable options for the likely answers.
- Always leave an escape hatch for custom free-text input.
- Prefer one structured round of several questions over several conversational turns.

## Why

Selectable options are faster to answer, reduce ambiguity in the reply, and keep multi-question rounds structured instead of collapsing into a single paragraph the user has to unpack.
