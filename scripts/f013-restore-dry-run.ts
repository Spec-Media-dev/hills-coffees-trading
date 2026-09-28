import { dryRunF013LocalRestore } from "./f013-restore-plan";

if (process.argv.length !== 3 || process.argv[2] !== "--dry-run") {
  throw new Error("F013 restore planner accepts only --dry-run; it never executes SQL.");
}

const plan = dryRunF013LocalRestore();
try {
  console.log(JSON.stringify({
    target: plan.target,
    databaseIdentityUnverified: plan.databaseIdentityUnverified,
    nonceIsPlaceholder: plan.nonceIsPlaceholder,
    steps: plan.steps.map((step) => ({ id: step.id, commands: step.commands.map((command) => command.transport === "docker-psql-stdin"
      ? { transport: command.transport, kind: command.kind, path: command.path }
      : { transport: command.transport, command: command.command, args: command.args, cwd: command.cwd }) })),
  }, null, 2));
} finally {
  plan.dispose();
}
