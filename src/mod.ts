import { packageJson } from "./package-json";
import { PuppetPadlocal } from "./puppet-padlocal";

const VERSION = packageJson.version || "0.0.0";

export { VERSION, PuppetPadlocal };
export default PuppetPadlocal;
