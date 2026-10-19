## 1. Smoke check

- [x] 1.1 In `scripts/ops/smoke_check.sh`, add `check_items` and use it for "Produkte je Markt" and "Suche je Markt": HTTP 200 and at least 1 item in the JSON list, otherwise FAIL.
- [x] 1.2 Update `scripts/ops/tests/test_smoke_check.py`: healthy stub returns items; add tests for an empty store list, an empty store search, an explicit store code and query, a non-list body and a 5xx. The existing read-only/credential-free source test stays unchanged.

## 2. Verification

- [x] 2.1 `python3 -I -m unittest discover scripts/ops` and `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
