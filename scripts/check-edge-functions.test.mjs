import { describe, expect, it } from "vitest";

import {
  parsePublicFunctionNames,
  validatePublicFunctionRegister,
} from "./check-edge-functions.mjs";

describe("Edge Function public access register", () => {
  it("finds every function configured with verify_jwt=false", () => {
    const config = `
[functions.public-one]
verify_jwt = false

[functions.private-one]
verify_jwt = true

[functions.public-two]
verify_jwt=false
`;

    expect(parsePublicFunctionNames(config)).toEqual(["public-one", "public-two"]);
  });

  it("requires every public Edge Function to be documented with compensating controls", () => {
    const config = `
[functions.public-one]
verify_jwt = false

[functions.public-two]
verify_jwt = false
`;
    const register = `
| Function | Reason | Controls | Abuse controls | Owner |
| --- | --- | --- | --- | --- |
| public-one | Webhook callback | Signature checked | Rate limited | platform |
`;

    expect(validatePublicFunctionRegister({ configText: config, registerText: register })).toEqual({
      publicFunctions: ["public-one", "public-two"],
      missing: ["public-two"],
    });
  });
});
