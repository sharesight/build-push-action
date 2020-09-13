import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import * as buildx from './buildx';
import * as core from '@actions/core';
import * as github from '@actions/github';

export const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-build-push-'));

export interface Inputs {
  context: string;
  file: string;
  buildArgs: string[];
  labels: string[];
  tags: string[];
  pull: boolean;
  target: string;
  allow: string[];
  noCache: boolean;
  builder: string;
  platforms: string[];
  load: boolean;
  push: boolean;
  outputs: string[];
  cacheFrom: string[];
  cacheTo: string[];
  secrets: string[];
  ssh: string[];
}

export async function getInputs(): Promise<Inputs> {
  return {
    context:
      core.getInput('context') ||
      `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}#${github.context.ref}`,
    file: core.getInput('file') || 'Dockerfile',
    buildArgs: await getInputList('build-args'),
    labels: await getInputList('labels'),
    tags: await getInputList('tags'),
    pull: /true/i.test(core.getInput('pull')),
    target: core.getInput('target'),
    allow: await getInputList('allow'),
    noCache: /true/i.test(core.getInput('no-cache')),
    builder: core.getInput('builder'),
    platforms: await getInputList('platforms'),
    load: /true/i.test(core.getInput('load')),
    push: /true/i.test(core.getInput('push')),
    outputs: await getInputList('outputs', true),
    cacheFrom: await getInputList('cache-from', true),
    cacheTo: await getInputList('cache-to', true),
    secrets: await getInputList('secrets', true),
    ssh: await getInputList('ssh')
  };
}

export async function getArgs(inputs: Inputs, buildxVersion: string): Promise<Array<string>> {
  let args: Array<string> = ['buildx'];
  args.push.apply(args, await getBuildArgs(inputs, buildxVersion));
  args.push.apply(args, await getCommonArgs(inputs));
  args.push(inputs.context);
  return args;
}

async function getBuildArgs(inputs: Inputs, buildxVersion: string): Promise<Array<string>> {
  let args: Array<string> = ['build'];
  await asyncForEach(inputs.buildArgs, async buildArg => {
    args.push('--build-arg', buildArg);
  });
  await asyncForEach(inputs.labels, async label => {
    args.push('--label', label);
  });
  await asyncForEach(inputs.tags, async tag => {
    args.push('--tag', tag);
  });
  if (inputs.target) {
    args.push('--target', inputs.target);
  }
  if (inputs.allow.length > 0) {
    args.push('--allow', inputs.allow.join(','));
  }
  if (inputs.platforms.length > 0) {
    args.push('--platform', inputs.platforms.join(','));
  }
  if (inputs.platforms.length == 0 || semver.satisfies(buildxVersion, '>=0.4.2')) {
    args.push('--iidfile', await buildx.getImageIDFile());
  }
  await asyncForEach(inputs.outputs, async output => {
    args.push('--output', output);
  });
  await asyncForEach(inputs.cacheFrom, async cacheFrom => {
    args.push('--cache-from', cacheFrom);
  });
  await asyncForEach(inputs.cacheTo, async cacheTo => {
    args.push('--cache-to', cacheTo);
  });
  await asyncForEach(inputs.secrets, async secret => {
    args.push('--secret', await buildx.getSecret(secret));
  });
  await asyncForEach(inputs.ssh, async ssh => {
    args.push('--ssh', ssh);
  });
  if (inputs.file) {
    args.push('--file', inputs.file);
  }
  return args;
}

async function getCommonArgs(inputs: Inputs): Promise<Array<string>> {
  let args: Array<string> = [];
  if (inputs.noCache) {
    args.push('--no-cache');
  }
  if (inputs.builder) {
    args.push('--builder', inputs.builder);
  }
  if (inputs.pull) {
    args.push('--pull');
  }
  if (inputs.load) {
    args.push('--load');
  }
  if (inputs.push) {
    args.push('--push');
  }
  return args;
}

export async function getInputList(name: string, ignoreComma?: boolean): Promise<string[]> {
  const items = core.getInput(name);
  if (items == '') {
    return [];
  }
  return items
    .split(/\r?\n/)
    .filter(x => x)
    .reduce<string[]>(
      (acc, line) => acc.concat(!ignoreComma ? line.split(',').filter(x => x) : line).map(pat => pat.trim()),
      []
    );
}

export const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};
