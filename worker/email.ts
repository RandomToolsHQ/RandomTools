import { z } from "zod";
export interface EmailEnvironment {
  ENVIRONMENT: string;
  EMAIL_PROVIDER?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
}
export function emailMode(
  env: EmailEnvironment,
): "development" | "resend" | "disabled" {
  const provider =
    env.EMAIL_PROVIDER ||
    (env.ENVIRONMENT === "development" ? "development" : "disabled");
  if (provider === "development" && env.ENVIRONMENT === "development")
    return "development";
  if (
    provider === "resend" &&
    z.email().safeParse(env.EMAIL_FROM).success &&
    env.RESEND_API_KEY &&
    env.RESEND_API_KEY.length >= 16
  )
    return "resend";
  return "disabled";
}
export async function deliverEmail(
  env: EmailEnvironment,
  to: string,
  kind: "verify" | "reset",
  link: string,
  idempotencyKey: string,
) {
  if (emailMode(env) !== "resend")
    throw Error("Email delivery is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject:
        kind === "verify"
          ? "Verify your RandomTools email"
          : "Reset your RandomTools password",
      text: `${kind === "verify" ? "Verify your email address" : "Reset your password"} using this link:\n\n${link}\n\nThis link expires in ${kind === "verify" ? "24 hours" : "30 minutes"} and can only be used once. If you did not request this, ignore this email.\n\nRandomTools HQ\nrandomtoolshq@gmail.com`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error("Email provider rejected the request");
  const result = z
    .object({ id: z.string().min(1) })
    .safeParse(await response.json());
  if (!result.success) throw Error("Invalid email provider response");
  // Provider acceptance is not a guarantee of inbox delivery.
}
