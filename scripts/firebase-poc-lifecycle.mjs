import { randomBytes } from "node:crypto";
/* global fetch */
import assert from "node:assert/strict";
import console from "node:console";
// Local emulator only. Its unsigned JWTs are never accepted by the POC Worker.
const base = "http://127.0.0.1:9099",
  project = "demo-randomtools-poc",
  email = "synthetic-" + randomBytes(8).toString("hex") + "@example.test",
  password = randomBytes(24).toString("base64url"),
  nextPassword = randomBytes(24).toString("base64url");
const results = [];
async function call(op, body) {
  const r = await fetch(
    base +
      "/identitytoolkit.googleapis.com/v1/accounts:" +
      op +
      "?key=synthetic-emulator-key",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { status: r.status, data: await r.json() };
}
const signup = await call("signUp", {
  email,
  password,
  returnSecureToken: true,
});
assert.equal(signup.status, 200);
results.push("email/password registration");
let login = await call("signInWithPassword", {
  email,
  password,
  returnSecureToken: true,
});
assert.equal(login.status, 200);
results.push("sign-in");
await call("sendOobCode", {
  requestType: "VERIFY_EMAIL",
  idToken: login.data.idToken,
});
let codes = await (
  await fetch(base + "/emulator/v1/projects/" + project + "/oobCodes")
).json();
let verification = codes.oobCodes.find(
  (x) => x.email === email && x.requestType === "VERIFY_EMAIL",
);
assert.ok(verification);
assert.equal(
  (await call("update", { oobCode: verification.oobCode })).status,
  200,
);
login = await call("signInWithPassword", {
  email,
  password,
  returnSecureToken: true,
});
let lookup = await call("lookup", { idToken: login.data.idToken });
assert.equal(lookup.data.users[0].emailVerified, true);
results.push("verification link application");
await call("sendOobCode", { requestType: "PASSWORD_RESET", email });
codes = await (
  await fetch(base + "/emulator/v1/projects/" + project + "/oobCodes")
).json();
let reset = codes.oobCodes.find(
  (x) => x.email === email && x.requestType === "PASSWORD_RESET",
);
assert.ok(reset);
assert.equal(
  (
    await call("resetPassword", {
      oobCode: reset.oobCode,
      newPassword: nextPassword,
    })
  ).status,
  200,
);
assert.notEqual(
  (
    await call("signInWithPassword", {
      email,
      password,
      returnSecureToken: true,
    })
  ).status,
  200,
);
results.push("password recovery and old credential rejection");
login = await call("signInWithPassword", {
  email,
  password: nextPassword,
  returnSecureToken: true,
});
assert.equal(login.status, 200);
assert.equal(
  (await call("delete", { idToken: login.data.idToken })).status,
  200,
);
assert.notEqual(
  (await call("lookup", { idToken: login.data.idToken })).status,
  200,
);
results.push("account deletion");
console.log(
  JSON.stringify({
    provider: "Firebase Auth Emulator",
    hosted: false,
    checks: results,
    passed: results.length,
    limitation:
      "Does not prove Google sign-in, real inbox delivery, production token signatures or hosted CPU.",
  }),
);
