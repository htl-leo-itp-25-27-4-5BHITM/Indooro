import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml } from "../../main/resources/META-INF/resources/admin/editor-core.js";

test("escapeHtml treats layout and identity data as text in markup contexts", () => {
  assert.equal(
    escapeHtml('<img src="x" onerror=\'alert(1)\'>&'),
    "&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;"
  );
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(7), "7");
});
