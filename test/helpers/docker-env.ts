import { execSync } from 'child_process';
import * as os from 'os';

/**
 * Automatically detects the Docker socket and configures
 * the environment variables needed by Testcontainers.
 */
function setupDockerEnvironment(): void {
  // Already configured → do nothing
  if (process.env.DOCKER_HOST) {
    return;
  }

  const home = os.homedir();

  // 1. Try to get the current Docker context endpoint (best method)
  try {
    const endpoint = execSync(
      'docker context inspect --format "{{.Endpoints.docker.Host}}"',
      { encoding: 'utf-8' },
    ).trim();

    if (endpoint && endpoint.startsWith('unix://')) {
      process.env.DOCKER_HOST = endpoint;
      process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE =
        '/var/run/docker.sock';
      process.env.TESTCONTAINERS_HOST_OVERRIDE = 'localhost';
      console.log(`✓ Using Docker context: ${endpoint}`);
      return;
    }
  } catch {
    // docker context command failed – fall back to file detection
  }

  console.warn(
    '⚠ Could not auto-detect Docker socket. Testcontainers may fail.',
  );
}

setupDockerEnvironment();
