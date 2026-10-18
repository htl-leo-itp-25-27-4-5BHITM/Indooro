// Response validation against the reviewed shared API contract (openspec/specs/shared-api/openapi.yaml).
// Used from httpYac response scripts, for example:
//
//   {{
//     const { validateResponse } = await import("../support/contract.mjs");
//     validateResponse("listMobileStores", response.statusCode, response.parsedBody);
//   }}
//
// Only the JSON schema of the documented response is checked. A documented response without an
// application/json schema (for example 202 Accepted) passes without a body check. A status that the
// operation does not document is an error.
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { parse } from "yaml";

const specUrl = new URL("../../../openspec/specs/shared-api/openapi.yaml", import.meta.url);
const doc = parse(readFileSync(specUrl, "utf8"));

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });

const operations = new Map();
for (const [path, item] of Object.entries(doc.paths ?? {})) {
  for (const method of HTTP_METHODS) {
    const operation = item?.[method];
    if (operation?.operationId) {
      operations.set(operation.operationId, { method: method.toUpperCase(), path, operation });
    }
  }
}

const validators = new Map();

function resolveResponse(response) {
  if (!response?.$ref) return response;
  const name = response.$ref.replace("#/components/responses/", "");
  return doc.components?.responses?.[name];
}

function validatorFor(operationId, status) {
  const key = `${operationId} ${status}`;
  if (validators.has(key)) return validators.get(key);

  const entry = operations.get(operationId);
  if (!entry) throw new Error(`validateResponse: operationId "${operationId}" does not exist in openapi.yaml`);

  const response = resolveResponse(entry.operation.responses?.[status]);
  if (!response) {
    const documented = Object.keys(entry.operation.responses ?? {}).join(", ");
    throw new Error(
      `validateResponse: ${entry.method} ${entry.path} (${operationId}) does not document status ${status}; documented: ${documented}`
    );
  }

  const schema = response.content?.["application/json"]?.schema;
  // $ref to #/components/schemas/... resolves against the root object, so the components travel with the schema.
  const validate = schema ? ajv.compile({ ...schema, components: doc.components }) : null;
  validators.set(key, validate);
  return validate;
}

export function validateResponse(operationId, status, body) {
  const validate = validatorFor(operationId, String(status));
  if (!validate) return;
  if (validate(body)) return;

  const details = (validate.errors ?? [])
    .map((error) => `  - ${error.instancePath || "/"} ${error.message}`)
    .join("\n");
  throw new Error(`validateResponse: ${operationId} ${status} does not match openapi.yaml:\n${details}`);
}
