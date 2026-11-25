import * as assert from "assert";
import {
  findNextStep,
  isActiveStatus,
  isServiceIdentity,
  isTimelineActive,
  requesterNeedsAuthor,
  resolveRequester,
  mapBuildStatus,
  mapRecordState,
  toBuildDetail,
  toBuildSummary,
  toStageSummaries,
} from "../../src/features/devops-pipelines/buildMapper";
import { RawBuild, RawTimeline } from "../../src/features/devops-pipelines/devOpsBuildsClient";

const ciBuild: RawBuild = {
  id: 101,
  buildNumber: "20261125.2",
  status: "inProgress",
  reason: "individualCI",
  queueTime: "2026-11-25T12:55:00Z",
  startTime: "2026-11-25T12:55:30Z",
  sourceBranch: "refs/heads/develop",
  sourceVersion: "b50c61a9deadbeef",
  sourceVersionMessage: "Match time entries with or without P prefix (#58)\n\nbody",
  definition: { id: 1, name: "firebolt-dashboard" },
  repository: { name: "NexusInnovation/team-firebolt-dashboard" },
  requestedFor: { displayName: "decarufe" },
};

const timeline: RawTimeline = {
  records: [
    { id: "s2", type: "Stage", name: "Build", state: "inProgress", order: 2 },
    { id: "s1", type: "Stage", name: "Detect changes", state: "completed", result: "succeeded", order: 1 },
    { id: "p1", parentId: "s1", type: "Phase", name: "Detect", state: "completed", result: "succeeded", order: 1 },
    { id: "j1", parentId: "p1", type: "Job", name: "Detect", state: "completed", result: "succeeded", order: 1 },
    { id: "p2", parentId: "s2", type: "Phase", name: "Build", state: "inProgress", order: 1 },
    { id: "j2", parentId: "p2", type: "Job", name: "Build", state: "inProgress", order: 1 },
    {
      id: "t1",
      parentId: "j2",
      type: "Task",
      name: "pnpm install",
      state: "completed",
      result: "succeededWithIssues",
      order: 3,
      issues: [
        { type: "warning", message: "Free disk space is low" },
        { type: "error", message: "Something broke" },
        { type: "info", message: "ignored" },
      ],
    },
    { id: "s3", type: "Stage", name: "Deploy", state: "pending", order: 3 },
  ],
};

suite("Unit: DevOps builds mapper", () => {
  test("mapBuildStatus maps status/result pairs", () => {
    assert.strictEqual(mapBuildStatus({ status: "notStarted" }), "queued");
    assert.strictEqual(mapBuildStatus({ status: "inProgress" }), "running");
    assert.strictEqual(mapBuildStatus({ status: "cancelling" }), "cancelling");
    assert.strictEqual(mapBuildStatus({ status: "completed", result: "succeeded" }), "succeeded");
    assert.strictEqual(mapBuildStatus({ status: "completed", result: "partiallySucceeded" }), "partiallySucceeded");
    assert.strictEqual(mapBuildStatus({ status: "completed", result: "canceled" }), "canceled");
    assert.strictEqual(mapBuildStatus({ status: "completed", result: "failed" }), "failed");
  });

  test("isActiveStatus is true only while the build is moving", () => {
    assert.ok(isActiveStatus("queued") && isActiveStatus("running") && isActiveStatus("cancelling"));
    assert.ok(!isActiveStatus("succeeded") && !isActiveStatus("failed") && !isActiveStatus("canceled"));
  });

  test("toBuildSummary maps a CI build", () => {
    const summary = toBuildSummary(ciBuild);

    assert.strictEqual(summary.title, "Match time entries with or without P prefix (#58)");
    assert.strictEqual(summary.triggerLabel, "Individual CI");
    assert.strictEqual(summary.branch, "develop");
    assert.strictEqual(summary.commit, "b50c61a9");
    assert.strictEqual(summary.status, "running");
    assert.strictEqual(summary.pullRequestNumber, undefined);
    assert.strictEqual(summary.requestedFor, "decarufe");
  });

  test("isServiceIdentity flags bots and service accounts but not people", () => {
    assert.strictEqual(isServiceIdentity({ displayName: "Microsoft.VisualStudio.Services.TFS" }), true);
    assert.strictEqual(
      isServiceIdentity({ displayName: "GitHub", uniqueName: "GitHub App\\2a1f3c4d-0000-1111-2222-333344445555" }),
      true
    );
    assert.strictEqual(
      isServiceIdentity({
        displayName: "Svc",
        uniqueName: "2a1f3c4d-0000-1111-2222-333344445555@2a1f3c4d-0000-1111-2222-333344445555",
      }),
      true
    );
    assert.strictEqual(isServiceIdentity(undefined), true);
    assert.strictEqual(isServiceIdentity({ displayName: "Eric De Carufel", uniqueName: "eric@nexus.com" }), false);
  });

  test("resolveRequester prefers the real requester, then the change author, then the PR sender", () => {
    const service = { displayName: "GitHub", uniqueName: "GitHub App\\2a1f3c4d-0000-1111-2222-333344445555" };
    const author = { displayName: "Eric De Carufel", imageUrl: "https://dev.azure.com/avatar" };

    assert.deepStrictEqual(
      resolveRequester({ ...ciBuild, requestedFor: { displayName: "Nathalie", imageUrl: "https://a/n" } }, author),
      {
        name: "Nathalie",
        imageUrl: "https://a/n",
      }
    );
    assert.deepStrictEqual(resolveRequester({ ...ciBuild, requestedFor: service }, author), {
      name: "Eric De Carufel",
      imageUrl: "https://dev.azure.com/avatar",
    });
    assert.deepStrictEqual(
      resolveRequester({
        ...ciBuild,
        requestedFor: service,
        triggerInfo: { "pr.sender.name": "ecarufel", "pr.sender.avatarUrl": "https://avatars.githubusercontent.com/u/1" },
      }),
      { name: "ecarufel", imageUrl: "https://avatars.githubusercontent.com/u/1" }
    );
    assert.deepStrictEqual(resolveRequester({ ...ciBuild, requestedFor: service }), { name: "GitHub" });
    assert.strictEqual(requesterNeedsAuthor({ ...ciBuild, requestedFor: service }), true);
    assert.strictEqual(requesterNeedsAuthor(ciBuild), false);
  });

  test("toBuildSummary uses the resolved requester when given", () => {
    const summary = toBuildSummary(ciBuild, undefined, { name: "Eric De Carufel", image: "data:image/png;base64,AA==" });

    assert.strictEqual(summary.requestedFor, "Eric De Carufel");
    assert.strictEqual(summary.requestedForImage, "data:image/png;base64,AA==");
  });

  test("toBuildSummary maps a pull request build using trigger info and the PR ref fallback", () => {
    const fromTrigger = toBuildSummary({
      ...ciBuild,
      reason: "pullRequest",
      sourceBranch: "refs/pull/58/merge",
      triggerInfo: { "pr.number": "58", "pr.title": "PR title", "pr.sourceBranch": "refs/heads/feature/x" },
    });
    assert.strictEqual(fromTrigger.triggerLabel, "PR automated");
    assert.strictEqual(fromTrigger.pullRequestNumber, "58");
    assert.strictEqual(fromTrigger.title, "PR title");
    assert.strictEqual(fromTrigger.branch, "feature/x");

    const fromRef = toBuildSummary({ ...ciBuild, reason: "pullRequest", sourceBranch: "refs/pull/59/merge" });
    assert.strictEqual(fromRef.pullRequestNumber, "59");
  });

  test("mapRecordState covers pending, running and every result", () => {
    assert.strictEqual(mapRecordState({ state: "pending" }), "pending");
    assert.strictEqual(mapRecordState({ state: "inProgress" }), "running");
    assert.strictEqual(mapRecordState({ state: "completed", result: "succeeded" }), "succeeded");
    assert.strictEqual(mapRecordState({ state: "completed", result: "succeededWithIssues" }), "warning");
    assert.strictEqual(mapRecordState({ state: "completed", result: "failed" }), "failed");
    assert.strictEqual(mapRecordState({ state: "completed", result: "abandoned" }), "canceled");
    assert.strictEqual(mapRecordState({ state: "completed", result: "skipped" }), "skipped");
  });

  test("toStageSummaries orders stages by their order", () => {
    assert.deepStrictEqual(toStageSummaries(timeline), [
      { name: "Detect changes", state: "succeeded" },
      { name: "Build", state: "running" },
      { name: "Deploy", state: "pending" },
    ]);
  });

  test("toBuildDetail nests jobs under their stage and collects issues with breadcrumbs, errors first", () => {
    const detail = toBuildDetail(ciBuild, timeline);

    assert.strictEqual(detail.repositoryName, "NexusInnovation/team-firebolt-dashboard");
    assert.deepStrictEqual(
      detail.stageDetails.map((s) => [s.name, s.jobs.map((j) => j.name)]),
      [
        ["Detect changes", ["Detect"]],
        ["Build", ["Build"]],
        ["Deploy", []],
      ]
    );
    assert.deepStrictEqual(detail.issues, [
      { message: "Something broke", severity: "error", source: "Build • Build • pnpm install" },
      { message: "Free disk space is low", severity: "warning", source: "Build • Build • pnpm install" },
    ]);
  });

  test("the implicit __default stage is displayed as Build", () => {
    const stages = toStageSummaries({
      records: [{ id: "s", type: "Stage", name: "__default", state: "completed", result: "succeeded", order: 1 }],
    });
    assert.strictEqual(stages[0].name, "Build");
  });

  test("toBuildDetail maps stage dependencies by stage identifier and exposes steps", () => {
    const graphTimeline: RawTimeline = {
      records: [
        { id: "s1", type: "Stage", name: "Build", identifier: "build", state: "completed", result: "succeeded", order: 1 },
        { id: "s2", type: "Stage", name: "Test", identifier: "test", state: "completed", result: "succeeded", order: 2 },
        { id: "s3", type: "Stage", name: "Deploy", identifier: "deploy", state: "pending", order: 3 },
        {
          id: "j1",
          parentId: "s1",
          type: "Job",
          name: "Compile",
          state: "completed",
          result: "succeeded",
          order: 1,
          log: { id: 5 },
        },
        { id: "t2", parentId: "j1", type: "Task", name: "Second", state: "completed", result: "succeeded", order: 2 },
        {
          id: "t1",
          parentId: "j1",
          type: "Task",
          name: "First",
          state: "completed",
          result: "succeeded",
          order: 1,
          log: { id: 6 },
        },
      ],
    };
    const dependencies = new Map([
      ["build", []],
      ["test", ["build"]],
      ["deploy", ["build", "test", "unknown"]],
    ]);

    const detail = toBuildDetail(ciBuild, graphTimeline, dependencies);

    assert.deepStrictEqual(
      detail.stageDetails.map((s) => s.dependsOn),
      [[], ["s1"], ["s1", "s2"]]
    );
    assert.strictEqual(detail.dependenciesInferred, false);
    const job = detail.stageDetails[0].jobs[0];
    assert.strictEqual(job.hasLog, true);
    assert.deepStrictEqual(
      job.steps.map((s) => [s.id, s.name, s.hasLog]),
      [
        ["t1", "First", true],
        ["t2", "Second", false],
      ]
    );
  });

  test("infers stage links from run timing when the declared dependencies are unavailable", () => {
    const timed: RawTimeline = {
      records: [
        {
          id: "a",
          type: "Stage",
          name: "A",
          order: 1,
          state: "completed",
          startTime: "2026-11-25T10:00:00Z",
          finishTime: "2026-11-25T10:01:00Z",
        },
        {
          id: "b",
          type: "Stage",
          name: "B",
          order: 2,
          state: "completed",
          startTime: "2026-11-25T10:01:00Z",
          finishTime: "2026-11-25T10:03:00Z",
        },
        {
          id: "c",
          type: "Stage",
          name: "C",
          order: 3,
          state: "completed",
          startTime: "2026-11-25T10:01:01Z",
          finishTime: "2026-11-25T10:02:00Z",
        },
        { id: "d", type: "Stage", name: "D", order: 4, state: "inProgress", startTime: "2026-11-25T10:03:01Z" },
        { id: "e", type: "Stage", name: "E", order: 5, state: "pending" },
      ],
    };

    const detail = toBuildDetail(ciBuild, timed);

    assert.strictEqual(detail.dependenciesInferred, true);
    assert.deepStrictEqual(
      detail.stageDetails.map((s) => s.dependsOn),
      [[], ["a"], ["a"], ["b"], ["d"]]
    );
  });

  test("findNextStep moves to the next unfinished step, then to a step running elsewhere", () => {
    const steps: RawTimeline = {
      records: [
        { id: "t1", parentId: "j1", type: "Task", name: "One", state: "completed", order: 1 },
        { id: "t2", parentId: "j1", type: "Task", name: "Two", state: "pending", order: 2 },
        {
          id: "t3",
          parentId: "j2",
          type: "Task",
          name: "Other",
          state: "inProgress",
          order: 1,
          startTime: "2026-11-25T10:00:00Z",
        },
      ],
    };

    assert.deepStrictEqual(findNextStep(steps, "t1"), { id: "t2", name: "Two" });
    assert.deepStrictEqual(findNextStep(steps, "t2"), { id: "t3", name: "Other" });
    assert.strictEqual(findNextStep(steps, "missing"), undefined);
  });

  test("isTimelineActive is true while a stage, job or step has not completed", () => {
    assert.strictEqual(isTimelineActive(timeline), true);
    assert.strictEqual(isTimelineActive({ records: [{ id: "s", type: "Stage", name: "S", state: "completed" }] }), false);
  });
});
