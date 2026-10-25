import { buildInfo } from "../core/build_info.js";
import { runBench } from "./bench.js";
import { Mode, parseOptions, usageText } from "./options.js";

const result = parseOptions(process.argv.slice(2));

if (result.error !== "") {
  process.stderr.write(`error: ${result.error}\n\n${usageText()}\n`);
  process.exitCode = 2;
} else if (result.options.mode === Mode.Help) {
  process.stdout.write(`${usageText()}\n`);
} else if (result.options.mode === Mode.Version) {
  process.stdout.write(`${buildInfo()}\n`);
} else {
  process.exitCode = runBench(result.options);
}
