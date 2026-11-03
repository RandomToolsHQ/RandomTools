export type BootstrapPlan = {
  subject: string;
  issuer: string;
  userId: string;
  operationId: string;
};

// Operator-only SQL. This module is never imported by the application Worker.
// No role-changing HTTP endpoint or email-based administrator selection exists.
export function bootstrapStatements(plan: BootstrapPlan) {
  if (
    !/^user_[A-Za-z0-9]+$/.test(plan.subject) ||
    !/^clerk_[a-f0-9]{64}$/.test(plan.userId) ||
    !/^founder_bootstrap_[a-f0-9]{32}$/.test(plan.operationId) ||
    plan.issuer !== "https://quiet-civet-8782.clerk.accounts.dev"
  )
    throw Error("Invalid staging bootstrap identity or operation");
  const trigger = plan.operationId;
  // Validated identifiers contain no quotes. The trigger makes the role change
  // and audit insertion atomic even when invoked through D1's operator REST API.
  const create = `CREATE TRIGGER ${trigger} AFTER UPDATE OF role ON users WHEN OLD.id='${plan.userId}' AND OLD.role='free' AND NEW.role='admin' BEGIN INSERT INTO audit_logs(id,actor_id,action,target_id,created_at) VALUES('${plan.operationId}','${plan.userId}','admin.bootstrap.founder','${plan.userId}',unixepoch()); END;`;
  const update =
    "UPDATE users SET role='admin' WHERE id=? AND role='free' AND verified=1 AND disabled=0 AND EXISTS(SELECT 1 FROM auth_identities a WHERE a.user_id=users.id AND a.issuer=? AND a.subject=? AND a.state='active') AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE id=?) AND NOT EXISTS(SELECT 1 FROM users WHERE role='admin') RETURNING id,role";
  return {
    create,
    update,
    params: [plan.userId, plan.issuer, plan.subject, plan.operationId],
    drop: `DROP TRIGGER IF EXISTS ${trigger}`,
  };
}
