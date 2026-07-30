# Pattern — orchestrating external scripts as subprocesses

**Date:** 2026-07-30
**Source:** Distilled from the Nexkit prerequisite-automation session (Link, Morpheus, Trinity, Tank, Ghost)
**Classification:** Generic — engineering pattern, language- and product-agnostic

Lessons that transfer to any codebase that shells out to scripts or external tools.

## 1. Put a process-runner seam in the design, not in the retrofit

If a single concrete class is the _only_ thing allowed to import the process API, every layer above it becomes unit-testable with an injected fake. Decide this before implementation — retrofitting a seam means rewriting the call sites and the tests together.

## 2. Route the tester before the implementer

Testability constraints are architectural inputs. In this session the tester caught the highest-value defect in the whole feature _before any code existed_: a "script not found" result must carry a **distinct signal** and must not collapse into a generic non-zero exit code, or the caller cannot tell a missing script from a legitimate negative answer.

## 3. Decode at the stream, not at the chunk

`chunk.toString("utf8")` per data event corrupts any multi-byte character that straddles a chunk boundary. Set the encoding on the stream once. This bites the moment output contains accents, box-drawing, or emoji — i.e. almost immediately for user-facing CLIs.

## 4. Killing a shell does not kill its descendants

Cancelling a script that invoked a package manager leaves the package manager running. Real cancellation needs process-group semantics: spawn detached and kill the group on POSIX; use a tree-kill on Windows. Where the tree kill cannot be delivered, **surface** the fact — return a flag and warn the user that a child may still be running. Never silently claim the work stopped.

## 5. Check the cancellation token late, not eagerly

Check it after a probe fails and immediately before throwing. Checking too early loses the information about _how far_ the run actually got, which is exactly what makes a cancellation report useful.

## 6. Normalize versions with a first-match numeric pattern

`[0-9]+(\.[0-9]+)*`, first match. Strip-the-non-numeric approaches silently return an empty string for real-world output like `v22.1.0` or `git version 2.43.0` — which reads as "outdated" and can go undetected on an entire platform for a long time.

## 7. Invoke the interpreter you actually need

`bash` and `sh` are not interchangeable. Scripts using process substitution or other bashisms fail obscurely under `sh` on systems where `sh` is not bash.

## 8. Never execute install-command strings from data files

Install strings in config are display-only. Executing them is a remote-code-execution vector the moment the config file is workspace-controlled.

## 9. Make the honest test boundary explicit

Tests that need real external tooling should be opt-in behind an environment flag and reported as _pending_ by default — so a green local run never implies coverage it does not have.

## 10. One authoritative contract, or three implementations will disagree

Exit codes, output markers, and state-file paths must be written down once and conformed to by every implementation. In this session three components each had their own idea of the state-file path, which silently broke convergence on **every** platform, not just the one that was suspected.
