import nodeCleanup from "node-cleanup";
import type * as PUPPET from "wechaty-puppet";

const RunningPuppets: PUPPET.Puppet[] = [];

nodeCleanup((exitCode, signal) => {
  // can not take any async actions while process exiting
  if (exitCode !== null) {
    return true;
  }

  // make shallow copy
  const puppets = RunningPuppets.slice();

  Promise.all(
    puppets.map(async(puppet) => {
      await puppet.stop();
    }),
  ).finally(() => {
    nodeCleanup.uninstall();
    process.kill(process.pid, signal!);
  }).catch(console.error);

  return false;
});

export function addRunningPuppet(puppet: PUPPET.Puppet) {
  RunningPuppets.push(puppet);
}

export function removeRunningPuppet(puppet: PUPPET.Puppet) {
  const puppetIndex = RunningPuppets.indexOf(puppet);
  if (puppetIndex !== -1) {
    delete RunningPuppets[puppetIndex];
  }
}
