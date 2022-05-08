import { packageJson } from "./package-json.js";
import { PuppetPadlocal } from "./puppet-padlocal.js";

const VERSION = packageJson.version || "0.0.0";

export { VERSION, PuppetPadlocal };
export default PuppetPadlocal;
