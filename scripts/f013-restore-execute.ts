import { F013TargetError, resolveF013Mode } from "./f013-local-target";
import { executeF013LocalRestore } from "./f013-restore-plan";

if (resolveF013Mode().kind !== "local") throw new F013TargetError("F013 restore execution requires local mode.");
if (process.argv.length !== 3 || process.argv[2] !== "--execute") {
  throw new F013TargetError("F013 restore execution accepts exactly --execute.");
}
executeF013LocalRestore();
