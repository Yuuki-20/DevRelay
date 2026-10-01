export function electronSpawnEnvironment(source = process.env) {
  const env = { ...source };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
