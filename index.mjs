import util from 'node:util';
import child_process from 'node:child_process';

import { stat, rm } from 'node:fs/promises';

const exec = util.promisify(child_process.exec);

const TASK_ROOT = process.env.LAMBDA_TASK_ROOT;

const errorResponse = (code, msg) => {
  console.log(msg);
  return {statusCode: code, body: msg};
};

const mysqldefCommand = (database_name, filepath, options) => {
  const user = ` -u ${options.username}`;
  const pass = options.password ? ` -p ${options.password}` : '';
  const host = options.host ? ` -h ${options.host}` : '';
  const port = options.port ? ` -P ${options.port}` : '';

  const cmdOpts = options.execute ? '' : '--dry-run';
  const cmd = `${TASK_ROOT}/mysqldef ${user}${pass}${host}${port} ${database_name} ${cmdOpts} < ${filepath}`;
  return cmd
};

const ensureRepositoryDirNotExist = async () => {
  const repStat = await stat('/tmp/repository');
  if (repStat) {
    const repDel = await rm('/tmp/repository', {recursive: true});
    if (!repDel) {
      return false;
    }
  }
  return true;
};

const gitCommand = (repository, branch, deploy_key_name) => {
  let ssh = "";
  let target = `https://github.com/${repository}.git`
  if (deploy_key_name) {
    ssh = `GIT_SSH_COMMAND='ssh -i ${TASK_ROOT}/deploy_keys/${deploy_key_name} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no' `;
    target = `git@github.com:${repository}.git`;
  }
  return `${ssh}git clone --depth=1 --branch ${branch} ${target} repository`;
};

const gitClone = async (repository, branch, deploy_key_name) => {
  const cmd = gitCommand(repository, branch, deploy_key_name);
  return exec(cmd, {cwd: '/tmp'});
};

export const handler = async (event) => {
  const dry_run = ('dry_run' in event) ? !!event['dry_run'] : true;
  const input = event['input'];

  let filepath;
  if (input instanceof String || typeof input === "string") {
    filepath = `${TASK_ROOT}/${input}`;
  } else if (input instanceof Object) {
    if (input.type === 'github') {
      const repository = input.repository;
      const branch = input.branch || 'main';
      const deploy_key_name = input.key_name || null;
      const schema_path = input.schema_path;
      const git = await gitClone(repository, branch, deploy_key_name);
      if (!git) {
        return errorResponse(500, "Failed to clone the repository");
      }
      filepath = `/tmp/repository/${schema_path}`;
    } else {
      const msg = 'Input needs to be a file path (in this container), or {"type":"github","repository":"owner/repo","schema_path":"db/schema.sql","key_name":"my_ssh_key_name"}';
      return errorResponse(400, msg);
    }
  } else {
    return errorResponse(400, "No input schema specified.");
  }

  const database_name = event['database_name'] || process.env.DATABASE_NAME;
  if (!database_name) {
    return errorResponse(400, "Database name is a mandatory event key(database_name) or environment variable(DATABASE_NAME).");
  }

  if (!ensureRepositoryDirNotExist()) {
    return errorResponse(500, "The repository directory is not empty and cannot be deleted.");
  }

  const options = {
    host: event['database_host'] || process.env.DATABASE_HOST,
    port: event['database_port'] || process.env.DATABASE_PORT,
    username: event['database_username'] || process.env.DATABASE_USERNAME || 'root',
    password: event['database_password'] || process.env.DATABASE_PASSWORD,
    execute: !dry_run,
  };
  const cmd = mysqldefCommand(database_name, filepath, options);
  const proc = await exec(cmd);

  console.log("-------------- stdout --------------\n" + proc.stdout);
  console.log("-------------- stderr --------------\n" + proc.stderr);

  const response = {
    statusCode: 200,
    body: JSON.stringify('Done'),
  };
  return response;
};
