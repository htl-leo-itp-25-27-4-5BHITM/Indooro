## 1. Evidence And Direction

- [x] 1.1 Analyze simulator logs showing the first iOS plan request timing out after 6 seconds.
- [x] 1.2 Confirm that a timed-out client request can be followed by another plan request and can waste OpenAI tokens.
- [x] 1.3 Analyze simulator logs showing server-side semantic prefiltering still produced weak suggestions for products such as Gouda and eggs.
- [x] 1.4 Decide to switch the plan flow to AI-first ranking with a bounded shared candidate catalog.
- [x] 1.5 Preserve the rule that empty/no popup is better than weak deterministic fallback suggestions.

## 2. iOS Request Timing And In-Flight Behavior

- [x] 2.1 Increase the iOS `/mobile/upsell/plan` timeout from 6 seconds to 25 seconds.
- [x] 2.2 Prevent `preloadPlan` from cancelling an active plan request during routine list/progress updates.
- [x] 2.3 Add or preserve debug logging for skipped duplicate in-flight work using `reason=in_flight_waiting`.
- [x] 2.4 Extend pending opportunity age so early station completion can wait for the longer plan response.
- [x] 2.5 Keep loaded-empty, loaded-with-suggestions, source fallback, and pending retry semantics intact.

## 3. Backend AI-First Plan Ranking

- [x] 3.1 Change plan candidate construction to provide a shared bounded `candidateProducts` catalog to OpenAI.
- [x] 3.2 Remove semantic per-opportunity server prefiltering from the plan OpenAI payload.
- [x] 3.3 Exclude current-list, completed, trigger, invalid, and duplicate product IDs before sending candidates to OpenAI.
- [x] 3.4 Keep OpenAI response validation against the server-side candidate map.
- [x] 3.5 Keep duplicate returned product IDs from appearing twice in one opportunity.
- [x] 3.6 Return empty suggestions instead of deterministic semantic fallback suggestions when OpenAI is unavailable, disabled, invalid, or timed out.
- [x] 3.7 Bump plan cache context to `upsell-plan-v4`.
- [x] 3.8 Increase backend OpenAI timeout default to 12000ms.
- [x] 3.9 Increase bounded candidate default to 150.
- [x] 3.10 Update Kubernetes config with `OPENAI_UPSELL_TIMEOUT_MS=12000` and `UPSELL_MAX_CANDIDATES=150`.

## 4. Tests

- [x] 4.1 Update backend tests so OpenAI-unavailable plan flows return `source=none` and empty suggestions.
- [x] 4.2 Update fake OpenAI validation tests so server validation keeps valid AI semantic choices and rejects unknown/duplicate IDs.
- [x] 4.3 Keep tests proving current-list, completed, and trigger products are not returned.
- [x] 4.4 Run `sh ./mvnw test -Dtest=UpsellSuggestionServiceTest,MobileUpsellResourceTest`.

## 5. Documentation And OpenSpec

- [x] 5.1 Update `documentation/upsell-candidate-ranking.md` for AI-first ranking.
- [x] 5.2 Update `documentation/AI_UPSELL_FLOW.md` with the shared `candidateProducts` payload.
- [x] 5.3 Update OpenSpec proposal to describe the AI-first strategy.
- [x] 5.4 Update OpenSpec design to remove the old hard-server-prefilter decision.
- [x] 5.5 Update OpenSpec requirements to require bounded AI catalog ranking and server ID validation.
- [x] 5.6 Update OpenSpec product-catalog spec so classification is optional internal support, not a required plan gate.
- [x] 5.7 Update this task list to match the current implemented strategy.

## 6. Verification

- [x] 6.1 Run backend upsell tests.
- [x] 6.2 Run iOS simulator build.
- [x] 6.3 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [x] 6.4 Run `git diff --check`.
- [x] 6.5 Check that no real OpenAI API key was added to tracked files.
- [x] 6.6 Manually retest the deployed LeoCloud-backed app and confirm no 6-second timeout retry occurs. (Vom Team am 2026-09-21 als manuell bestanden bestätigt.)
- [x] 6.7 Manually confirm the deployed debug logs show `in_flight_waiting` instead of a second OpenAI plan request when progress changes while a plan is loading. (Vom Team am 2026-09-21 als manuell bestanden bestätigt.)

## 7. Commit, Build, Deploy, Rollback

- [x] 7.1 Commit the implementation and OpenSpec updates.
- [x] 7.2 Push `main` so GitHub Actions builds and pushes `ghcr.io/.../indooro-backend-v2:latest`.
- [x] 7.3 Wait for the GitHub Actions backend image build to complete successfully.
- [x] 7.4 Apply LeoCloud backend manifest with `kubectl -n student-it220209 apply -f k8s/backend.yaml`.
- [x] 7.5 Restart LeoCloud backend with `kubectl -n student-it220209 rollout restart deployment/indooro-backend`.
- [x] 7.6 Wait for rollout with `kubectl -n student-it220209 rollout status deployment/indooro-backend`.
- [x] 7.7 Verify LeoCloud deployment readiness with `kubectl -n student-it220209 get deployment indooro-backend`.
- [x] 7.8 Record rollback command/state in the final response.

## 8. Equivalent Product Variants

- [x] 8.1 Extend the OpenAI prompts so another brand, package size, flavor, or variant of the trigger product is treated as an alternative rather than an add-on.
- [x] 8.2 Bump the plan cache context to `upsell-plan-v5` so cached results from the older prompt are not reused.
- [x] 8.3 Add a regression test that verifies the plan prompt contains the alternative-product exclusion rule.
- [x] 8.4 Run targeted backend tests and strict OpenSpec validation.
