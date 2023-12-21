import util from 'node:util';
import child_process from 'node:child_process';

import { stat, rm } from 'node:fs/promises';

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const exec = util.promisify(child_process.exec);

const TASK_ROOT = process.env.LAMBDA_TASK_ROOT;

const secretsManagerClient = new SecretsManagerClient();

const secrets = {};
const getSecret = async (secretName) => {
  if (secretName in secrets) {
    return secrets[secretName];
  }
  const response = await secretsManagerClient.send(
    new GetSecretValueCommand({
      SecretId: secretName,
    })
  );
  const secret = response.SecretString;
  secrets[secretName] = secret;
  return secret;
};

const resolveSecret = async (value) => {
  // secrets_manager:input_secret_name
  if (!value) {
    return value;
  }
  if (!value.startsWith('secrets_manager:')) {
      return value;
  }
  const parts = value.substring('secrets_manager:'.length).split(":", 2);
  const secretName = parts[0];
  const secret = await getSecret(secretName);
  if (parts.length < 2) {
    return secret;
  }
  const jsonKey = parts[1];
  const obj = JSON.parse(secret);
  return obj[jsonKey];
};

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

const repositoryDirExist = async () => {
  let result = false;
  try {
    const repStat = await stat('/tmp/repository');
    if (repStat) {
      const repDel = await rm('/tmp/repository', {force: true, recursive: true});
      if (repDel !== undefined) {
        console.log({"here":"/tmp/repository exists and cannot be deleted", repDel});
        result = true;
      }
    }
  } catch (e) {
    if (e.code === 'ENOENT') {
      // no problem
    } else {
      console.log({"here":"/tmp/repository exists and cannot be deleted", e});
      result = true;
    }
  }
  return result;
};

const gitCommand = (repository, branch, deploy_key_name) => {
  let ssh = "";
  let target = `https://github.com/${repository}.git`
  if (deploy_key_name) {
    ssh = `GIT_SSH_COMMAND='ssh -i ${TASK_ROOT}/deploy_keys/${deploy_key_name} -F /dev/null -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null' `;
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
      const repoExists = await repositoryDirExist();
      if (repoExists) {
        return errorResponse(500, "The repository directory is not empty and cannot be deleted.");
      }

      const repository = input.repository;
      const branch = input.branch || 'main';
      const deploy_key_name = input.key_name || null;
      const schema_path = input.schema_path;
      const git = await gitClone(repository, branch, deploy_key_name);
      if (!git || git.error) {
        return errorResponse(500, `Failed to clone the repository, error:${git.error}`);
      }
      filepath = `/tmp/repository/${schema_path}`;
    } else {
      const msg = 'Input needs to be a file path (in this container), or {"type":"github","repository":"owner/repo","schema_path":"db/schema.sql","key_name":"my_ssh_key_name"}';
      return errorResponse(400, msg);
    }
  } else {
    return errorResponse(400, "No input schema specified.");
  }

  const database_name = await resolveSecret(event['database_name'] || process.env.DATABASE_NAME);
  if (!database_name) {
    return errorResponse(400, "Database name is a mandatory event key(database_name) or environment variable(DATABASE_NAME).");
  }

  const host_name = await resolveSecret(event['database_host'] || process.env.DATABASE_HOST);
  const port_num = await resolveSecret(event['database_port'] || process.env.DATABASE_PORT);
  const username = await resolveSecret(event['database_username'] || process.env.DATABASE_USERNAME || 'root');
  const password = await resolveSecret(event['database_password'] || process.env.DATABASE_PASSWORD);
  const options = {
    host: host_name,
    port: port_num,
    username: username,
    password: password,
    execute: !dry_run,
  };
  const cmd = mysqldefCommand(database_name, filepath, options);
  try {
    const proc = await exec(cmd);
    console.log("-------------- stdout --------------\n" + proc.stdout);
    console.log("-------------- stderr --------------\n" + proc.stderr);
  } catch (error) {
    console.log("Error: " + error);
  }
  const response = {
    statusCode: 200,
    body: JSON.stringify('Done'),
  };
  return response;
};
