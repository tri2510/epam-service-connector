#!/usr/bin/env node
// Copyright (c) 2026 Eclipse Foundation.
// 
// This program and the accompanying materials are made available under the
// terms of the MIT License which is available at
// https://opensource.org/licenses/MIT.
//
// SPDX-License-Identifier: MIT

const io = require('socket.io-client');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

const kitManagerUrl = process.env.KIT_MANAGER_URL || 'https://kit.digitalauto.tech';
const instanceId = process.env.INSTANCE_ID || 'AET-unknown';
const instanceName = process.env.INSTANCE_NAME || 'AOS Edge Toolchain';
const broadcastInterval = parseInt(process.env.BROADCAST_INTERVAL || '30000');
const workspaceDir = '/workspace';
const aoscloudUrl = process.env.AOSCLOUD_URL || 'https://aoscloud.io:10000';
const defaultServiceUuid = process.env.SERVICE_UUID || '';
const defaultUnitUid = process.env.UNIT_UID || '';
const defaultSubjectId = process.env.SUBJECT_ID || '';
const certPath = '/root/.aos/security/aos-user-sp.p12';
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';

console.log('[Broadcaster] Starting:', instanceId);
console.log('[Broadcaster] Kit Manager:', kitManagerUrl);
if (proxyUrl) {
  console.log('[Broadcaster] Proxy:', proxyUrl);
}

let socket;
let broadcastTimer = null;

async function initCertFromEnv() {
  const certFile = process.env.CERT_FILE;
  if (!certFile) return;

  const certDir = '/root/.aos/security';
  const certDest = path.join(certDir, 'aos-user-sp.p12');

  try {
    await fs.mkdir(certDir, { recursive: true });
    await fs.copyFile(certFile, certDest);
    await fs.chmod(certDest, 0o600);
    console.log(`[Broadcaster] Certificate loaded: ${certFile} → ${certDest}`);
  } catch (err) {
    console.error(`[Broadcaster] CERT_FILE=${certFile} — failed to copy:`, err.message);
  }
}

async function main() {
  await initCertFromEnv();
  const socketOpts = {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 5000,
    reconnectionDelayMax: 10000
  };

  socketOpts.rejectUnauthorized = false;

  if (proxyUrl) {
    try {
      const mod = await import('/usr/local/lib/node_modules/https-proxy-agent/dist/index.js');
      const HttpsProxyAgent = mod.HttpsProxyAgent || mod.default;
      const agent = new HttpsProxyAgent(proxyUrl);
      socketOpts.agent = agent;
      socketOpts.transports = ['polling', 'websocket'];
      console.log('[Broadcaster] Proxy agent configured');
    } catch (err) {
      console.warn('[Broadcaster] https-proxy-agent not available, proxy will not be used:', err.message);
    }
  }

  socket = io(kitManagerUrl, socketOpts);

  socket.on('connect', () => {
    console.log('[Broadcaster] Connected to Kit Manager');

    const registration = {
      kit_id: instanceId,
      name: instanceName,
      desc: 'AOS Edge Toolchain - Docker build service for AOS applications',
      support_apis: [
        'aos_build_deploy',
        'aos_list_apps',
        'aos_start_app',
        'aos_stop_app',
        'aos_get_deployment_status',
        'aos_upload_cert',
        'aos_check_cert',
        'aos_list_services',
        'aos_list_units',
        'aos_list_subjects',
        'aos_get_service_units',
        'aos_get_service_versions',
        'aos_get_unit_monitoring',
        'aos_get_alerts',
        'aos_request_service_log',
        'aos_get_service_log_status'
      ],
      type: 'aos-edge-toolchain',
      suffix: instanceId.split('-')[0],
      online: true
    };

    socket.emit('register_kit', registration);
    console.log('[Broadcaster] Registration sent:', registration.kit_id);
    startBroadcasting();
  });

  socket.on('connect_error', (error) => {
    console.error('[Broadcaster] Connection error:', error.message);
  });

  socket.on('disconnect', (reason) => {
    console.warn('[Broadcaster] Disconnected:', reason);
    stopBroadcasting();
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('[Broadcaster] Reconnected after', attemptNumber, 'attempts');
    startBroadcasting();
  });

  socket.on('messageToKit', async (data) => {
    console.log('[Broadcaster] Received message:', data.cmd, data.type);

    try {
      let response;

      switch (data.cmd || data.type) {
        case 'aos_build_deploy':
          response = await handleBuildDeploy(data);
          break;
        case 'aos_list_apps':
          response = await handleListApps(data);
          break;
        case 'aos_start_app':
          response = await handleStartApp(data);
          break;
        case 'aos_stop_app':
          response = await handleStopApp(data);
          break;
        case 'aos_get_deployment_status':
          response = await handleGetDeploymentStatus(data);
          break;
        case 'aos_upload_cert':
          response = await handleUploadCert(data);
          break;
        case 'aos_check_cert':
          response = await handleCheckCert(data);
          break;
        case 'aos_list_services':
          response = await handleListAosCloud(data, 'services');
          break;
        case 'aos_list_units':
          response = await handleListAosCloud(data, 'units');
          break;
        case 'aos_list_subjects':
          response = await handleListAosCloud(data, 'subjects');
          break;
        case 'aos_get_service_units':
          response = await handleGetServiceUnits(data);
          break;
        case 'aos_get_service_versions':
          response = await handleGetServiceVersions(data);
          break;
        case 'aos_get_unit_monitoring':
          response = await handleGetUnitMonitoring(data);
          break;
        case 'aos_get_alerts':
          response = await handleGetAlerts(data);
          break;
        case 'aos_request_service_log':
          response = await handleRequestServiceLog(data);
          break;
        case 'aos_get_service_log_status':
          response = await handleGetServiceLogStatus(data);
          break;
        default:
          response = {
            id: data.id,
            kit_id: instanceId,
            type: data.type || data.cmd,
            status: 'error',
            message: 'Unknown command: ' + (data.cmd || data.type)
          };
      }

      response.id = data.id;
      response.request_from = data.request_from;
      socket.emit('messageToKit-kitReply', response);
      console.log('[Broadcaster] Response sent:', response.status);

    } catch (error) {
      console.error('[Broadcaster] Error handling message:', error.message);
      socket.emit('messageToKit-kitReply', {
        id: data.id,
        kit_id: instanceId,
        type: data.type || data.cmd,
        status: 'error',
        message: error.message
      });
    }
  });
}

function detectArch(yamlConfig) {
  const archMatch = yamlConfig.match(/arch:\s*(\S+)/);
  const arch = archMatch ? archMatch[1] : '';
  if (arch === 'aarch64' || arch === 'arm64') return 'aarch64';
  if (arch === 'x86_64' || arch === 'amd64') return 'x86_64';
  const { arch: hostArch } = require('os');
  const ha = hostArch();
  return (ha === 'x64' || ha === 'x86_64') ? 'x86_64' : 'aarch64';
}

function compilerForArch(arch) {
  return arch === 'x86_64' ? 'g++' : 'aarch64-linux-gnu-g++';
}

async function bundleDynamicLibs(binaryPath, srcDir) {
  try {
    const { stdout } = await execAsync(`ldd ${binaryPath} 2>/dev/null`);
    if (stdout.includes('not a dynamic executable')) return false;

    const libsDir = path.join(srcDir, 'libs');
    await fs.mkdir(libsDir, { recursive: true });

    // Copy the ELF interpreter (ld-linux) — required because crun containers
    // have a minimal rootfs without a dynamic linker
    const { stdout: interpOut } = await execAsync(`readelf -l ${binaryPath} | grep 'interpreter' | sed 's/.*: //' | tr -d ']'`);
    const interp = interpOut.trim();
    if (interp) {
      await fs.copyFile(interp, path.join(libsDir, path.basename(interp)));
      console.log('[Build] Bundled dynamic linker:', path.basename(interp));
    }

    const lines = stdout.split('\n').filter(l => l.includes('=>'));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const libPath = parts[2];
      if (libPath && libPath.startsWith('/')) {
        try { await fs.copyFile(libPath, path.join(libsDir, path.basename(libPath))); } catch (e) { /* skip */ }
      }
    }

    const binName = path.basename(binaryPath);
    const ldName = interp ? path.basename(interp) : 'ld-linux-x86-64.so.2';
    await fs.rename(path.join(srcDir, binName), path.join(srcDir, binName + '-bin'));
    const wrapper = `#!/bin/sh\nDIR=$(dirname $(readlink -f $0))\nexec $DIR/libs/${ldName} --library-path $DIR/libs $DIR/${binName}-bin "$@"\n`;
    await fs.writeFile(path.join(srcDir, binName), wrapper, { mode: 0o755 });
    console.log('[Build] Bundled', lines.length, 'libs + wrapper for', binName);
    return true;
  } catch (e) {
    console.warn('[Build] bundleDynamicLibs failed:', e.message);
    return false;
  }
}

async function handleBuildDeploy(data) {
  const appName = data.name || 'hello-aos';
  const cppCode = data.cppCode || '';
  const yamlConfig = data.yamlConfig || '';

  console.log('[Build] Starting build for:', appName);
  console.log('[Build] C++ code length:', cppCode.length);
  console.log('[Build] YAML config length:', yamlConfig.length);

  try {
    await execAsync('rm -rf /workspace/src /workspace/meta /workspace/project /workspace/generated', { cwd: workspaceDir });
    await fs.mkdir(path.join(workspaceDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, 'meta'), { recursive: true });

    await fs.writeFile(path.join(workspaceDir, 'src/main.cpp'), cppCode);
    await fs.writeFile(path.join(workspaceDir, 'meta/config.yaml'), yamlConfig);
    await fs.writeFile(path.join(workspaceDir, 'meta/default_state.dat'), '');

    const certSrc = '/root/.aos/security/aos-user-sp.p12';
    try { await fs.copyFile(certSrc, path.join(workspaceDir, 'aos-user-sp.p12')); } catch (e) { /* ok */ }

    const targetArch = detectArch(yamlConfig);
    const cxx = compilerForArch(targetArch);
    console.log('[Build] Target arch:', targetArch, '→ compiler:', cxx);

    const isGrpcProject = cppCode.includes('grpcpp') || cppCode.includes('grpc.pb.h');
    const builtBinary = path.join(workspaceDir, appName);

    if (isGrpcProject) {
      console.log('[Build] Detected gRPC project');
      const genDir = path.join(workspaceDir, 'generated');
      await fs.mkdir(path.join(genDir, 'kuksa/val/v1'), { recursive: true });
      const protoDir = '/usr/local/share/kuksa-proto';
      const grpcPlugin = (await execAsync('which grpc_cpp_plugin').catch(() => ({stdout:'/usr/bin/grpc_cpp_plugin'}))).stdout.trim();

      for (const proto of ['types', 'val']) {
        await execAsync(`protoc --proto_path=${protoDir} --cpp_out=${genDir} --grpc_out=${genDir} --plugin=protoc-gen-grpc=${grpcPlugin} ${protoDir}/kuksa/val/v1/${proto}.proto`);
      }
      console.log('[Build] Proto stubs generated');

      const grpcFlags = targetArch === 'x86_64'
        ? '$(pkg-config --cflags --libs grpc++ protobuf) -lpthread'
        : '-I/opt/grpc-aarch64/include -L/opt/grpc-aarch64/lib -lgrpc++ -lprotobuf -lpthread';
      const staticFlag = targetArch === 'x86_64' ? '' : '-static';
      const compileCmd = `${cxx} -std=c++17 -O2 ${staticFlag} -I${genDir} ` +
        `${workspaceDir}/src/main.cpp ` +
        `${genDir}/kuksa/val/v1/types.pb.cc ${genDir}/kuksa/val/v1/types.grpc.pb.cc ` +
        `${genDir}/kuksa/val/v1/val.pb.cc ${genDir}/kuksa/val/v1/val.grpc.pb.cc ` +
        `${grpcFlags} -o ${builtBinary}`;
      console.log('[Build] Compiling gRPC app...');
      await execAsync(compileCmd, { cwd: workspaceDir, env: { ...process.env }, timeout: 300000 });
    } else {
      const staticFlag = '-static';
      const compileCmd = `${cxx} ${staticFlag} -std=c++17 -O2 ${workspaceDir}/src/main.cpp -o ${builtBinary}`;
      console.log('[Build] Compiling simple app...');
      await execAsync(compileCmd, { cwd: workspaceDir, timeout: 60000 });
    }

    const { stdout: fileOut } = await execAsync(`file ${builtBinary}`);
    console.log('[Build]', fileOut.trim());

    await fs.copyFile(builtBinary, path.join(workspaceDir, 'src', appName));
    try { await fs.unlink(path.join(workspaceDir, 'src/main.cpp')); } catch (e) { /* ok */ }

    if (isGrpcProject && targetArch === 'x86_64') {
      await bundleDynamicLibs(path.join(workspaceDir, 'src', appName), path.join(workspaceDir, 'src'));
    }

    console.log('[Build] Signing...');
    const { stdout: signOut, stderr: signErr } = await execAsync('aos-signer sign', { cwd: workspaceDir, env: { ...process.env } });
    console.log('[Build] Sign:', signOut.slice(-200));

    const pkgStats = await fs.stat(path.join(workspaceDir, 'service.tar.gz')).catch(() => null);
    if (!pkgStats) throw new Error('Package not created after signing');
    console.log('[Build] Package:', pkgStats.size, 'bytes');

    let uploadResult = null;
    try {
      const { stdout: uploadOut } = await execAsync('aos-signer upload', { cwd: workspaceDir, env: { ...process.env } });
      uploadResult = uploadOut;
      console.log('[Build] Upload:', uploadOut.slice(-200));
    } catch (uploadErr) {
      console.log('[Build] Upload failed:', uploadErr.message.slice(-100));
    }

    return {
      kit_id: instanceId,
      type: 'aos_build_deploy',
      status: 'success',
      appId: appName,
      executionId: appName,
      message: 'Build completed successfully',
      packageSize: pkgStats.size,
      uploadResult: uploadResult ? 'uploaded' : 'not_uploaded'
    };

  } catch (error) {
    console.error('[Build] Error:', error.message);
    return {
      kit_id: instanceId,
      type: 'aos_build_deploy',
      status: 'error',
      message: error.message,
      appId: appName
    };
  }
}

async function handleListApps(data) {
  return {
    kit_id: instanceId,
    type: 'aos_list_apps',
    status: 'success',
    applications: []
  };
}

async function handleStartApp(data) {
  return {
    kit_id: instanceId,
    type: 'aos_start_app',
    status: 'success',
    appId: data.appId,
    message: 'App start requested'
  };
}

async function handleStopApp(data) {
  return {
    kit_id: instanceId,
    type: 'aos_stop_app',
    status: 'success',
    appId: data.appId,
    message: 'App stop requested'
  };
}

async function curlAosCloud(apiPath) {
  const { stdout } = await execAsync(
    `curl -k --http1.1 ${aoscloudUrl}/api/v10/${apiPath} ` +
    `--cert ${certPath} --cert-type P12 ` +
    `-H "accept: application/json"`,
    { env: { ...process.env }, timeout: 15000 }
  );
  return JSON.parse(stdout);
}

async function handleListAosCloud(data, resource) {
  console.log(`[AosCloud] Listing ${resource}...`);
  try {
    const result = await curlAosCloud(`${resource}/`);
    const items = result.items || result || [];

    let mapped;
    if (resource === 'services') {
      mapped = items.map((s) => ({
        uuid: s.uuid,
        title: s.title || s.name,
        description: s.description || '',
        provider: s.service_provider_title || ''
      }));
    } else if (resource === 'units') {
      mapped = items.map((u) => ({
        uid: u.system_uid,
        name: u.model?.name || u.name || u.display_name || 'Unknown',
        online: u.online_status === 'Online',
        status: u.online_status,
        manufacturer: u.manufacturer || ''
      }));
    } else {
      mapped = items.map((s) => ({
        id: s.id || s.subject_id,
        label: s.label || s.name || 'Unknown',
        isGroup: s.is_group || false
      }));
    }

    return {
      kit_id: instanceId,
      type: `aos_list_${resource}`,
      status: 'success',
      items: mapped,
      total: result.total || mapped.length,
      defaults: {
        serviceUuid: defaultServiceUuid,
        unitUid: defaultUnitUid,
        subjectId: defaultSubjectId
      }
    };
  } catch (error) {
    console.error(`[AosCloud] Error listing ${resource}:`, error.message);
    return {
      kit_id: instanceId,
      type: `aos_list_${resource}`,
      status: 'error',
      message: error.message
    };
  }
}

async function handleGetDeploymentStatus(data) {
  const serviceUuid = data.serviceUuid || defaultServiceUuid;
  const unitUid = data.unitUid || defaultUnitUid;
  const subjectId = data.subjectId || defaultSubjectId;

  if (!serviceUuid) {
    return {
      kit_id: instanceId,
      type: 'aos_get_deployment_status',
      status: 'error',
      message: 'No service UUID provided. Select a service or set SERVICE_UUID in .env'
    };
  }

  console.log('[DeploymentStatus] Fetching status for service:', serviceUuid);

  try {
    const service = await curlAosCloud(`services/${serviceUuid}/`);

    let unit = null;
    if (unitUid) {
      try {
        const units = await curlAosCloud('units/');
        const unitList = units.items || units || [];
        unit = unitList.find((u) => u.system_uid === unitUid) || null;
      } catch (e) { console.warn('[DeploymentStatus] Could not fetch units:', e.message); }
    }

    let subject = null;
    if (subjectId) {
      try {
        const subjects = await curlAosCloud('subjects/');
        const subjectList = subjects.items || subjects || [];
        subject = subjectList.find((s) => (s.id || s.subject_id) === subjectId) || null;
      } catch (e) { console.warn('[DeploymentStatus] Could not fetch subjects:', e.message); }
    }

    const versions = service.versions || [];
    const activeVersion = versions.find((v) => v.state === 'ready') || versions[0];
    const currentVersion = activeVersion ? activeVersion.version : 'unknown';

    return {
      kit_id: instanceId,
      type: 'aos_get_deployment_status',
      status: 'success',
      service: {
        uuid: service.uuid || serviceUuid,
        name: service.title || service.name || 'Unknown',
        description: service.description || '',
        currentVersion,
        totalVersions: versions.length,
        versions: versions.map((v) => ({
          version: v.version,
          state: v.state,
          createdAt: v.created_at
        }))
      },
      subject: subject ? {
        id: subject.id || subject.subject_id || subjectId,
        name: subject.label || subject.name || 'Unknown'
      } : null,
      unit: unit ? {
        uid: unit.system_uid || unitUid,
        name: unit.model?.name || unit.name || unit.display_name || 'Unknown',
        ip: unit.ip || 'unknown',
        online: unit.online_status === 'Online' || unit.online !== false,
        onlineStatus: unit.online_status,
        lastSeen: unit.last_seen
      } : null,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[DeploymentStatus] Error:', error.message);
    return {
      kit_id: instanceId,
      type: 'aos_get_deployment_status',
      status: 'error',
      message: error.message
    };
  }
}

async function handleUploadCert(data) {
  const certDir = '/root/.aos/security';
  const certName = data.certName || 'aos-user-sp';
  const certPath = path.join(certDir, `${certName}.p12`);

  if (!data.certData) {
    return {
      kit_id: instanceId,
      type: 'aos_upload_cert',
      status: 'error',
      message: 'No certificate data provided'
    };
  }

  try {
    await fs.mkdir(certDir, { recursive: true });
    const certBytes = Buffer.from(data.certData, 'base64');
    await fs.writeFile(certPath, certBytes, { mode: 0o600 });
    console.log(`[Cert] Wrote certificate: ${certPath} (${certBytes.length} bytes)`);

    // Also generate .pem for curl usage
    try {
      const pemPath = path.join(certDir, `${certName}.pem`);
      await execAsync(`openssl pkcs12 -in ${certPath} -out ${pemPath} -nodes -passin pass:`, { timeout: 10000 });
      console.log(`[Cert] Generated PEM: ${pemPath}`);
    } catch (pemErr) {
      console.warn('[Cert] PEM generation failed (cert may require a password):', pemErr.message);
    }

    return {
      kit_id: instanceId,
      type: 'aos_upload_cert',
      status: 'success',
      message: `Certificate saved (${certBytes.length} bytes)`,
      certPath
    };
  } catch (error) {
    console.error('[Cert] Upload error:', error.message);
    return {
      kit_id: instanceId,
      type: 'aos_upload_cert',
      status: 'error',
      message: error.message
    };
  }
}

async function handleCheckCert(data) {
  const certDir = '/root/.aos/security';
  const certName = data.certName || 'aos-user-sp';
  const p12Path = path.join(certDir, `${certName}.p12`);

  try {
    const stats = await fs.stat(p12Path).catch(() => null);
    if (!stats) {
      return {
        kit_id: instanceId,
        type: 'aos_check_cert',
        status: 'success',
        certLoaded: false,
        source: 'none',
        message: 'No certificate found'
      };
    }

    // Check if Key Vault env is set
    const vaultName = process.env.AZURE_KEY_VAULT_NAME || '';

    return {
      kit_id: instanceId,
      type: 'aos_check_cert',
      status: 'success',
      certLoaded: true,
      certSize: stats.size,
      certPath: p12Path,
      source: vaultName ? 'keyvault' : 'manual',
      vaultName: vaultName || null,
      message: `Certificate loaded (${stats.size} bytes)`
    };
  } catch (error) {
    return {
      kit_id: instanceId,
      type: 'aos_check_cert',
      status: 'error',
      message: error.message
    };
  }
}

async function handleGetServiceUnits(data) {
  const serviceUuid = data.serviceUuid;
  if (!serviceUuid) return { kit_id: instanceId, type: 'aos_get_service_units', status: 'error', message: 'No serviceUuid provided' };

  try {
    const result = await curlAosCloud(`services/${serviceUuid}/units/`);
    const items = result.items || result || [];

    // /services/{id}/units/ returns minimal data — enrich with /units/{uid}/ detail
    const enriched = await Promise.all(items.map(async (u) => {
      const uid = u.system_uid || u.uid;
      try {
        const detail = await curlAosCloud(`units/${uid}/`);
        // Find service instance run state from the unit's services_subjects
        let runState = '';
        let version = '';
        let error = '';
        const svcSubjects = detail.services_subjects || [];
        for (const ss of svcSubjects) {
          if (ss.service?.uuid === serviceUuid) {
            const inst = (ss.instances || [])[0];
            if (inst) { runState = inst.run_state || ''; version = inst.version || ''; error = inst.error_message || ''; }
            else if (ss.service_versions?.installed_service_version) { version = ss.service_versions.installed_service_version.version || ''; }
            if (ss.error_message) error = error || ss.error_message;
            break;
          }
        }
        return {
          uid,
          name: detail.model?.name || detail.name || uid.substring(0, 12),
          online: detail.online_status === 'Online',
          status: detail.online_status || 'Unknown',
          runState,
          version,
          error,
          ip: detail.ip || ''
        };
      } catch (e) {
        return { uid, name: uid.substring(0, 12), online: false, status: 'Unknown', runState: '', version: '', error: '', ip: '' };
      }
    }));

    return {
      kit_id: instanceId,
      type: 'aos_get_service_units',
      status: 'success',
      serviceUuid,
      units: enriched
    };
  } catch (error) {
    console.error('[AosCloud] Error getting service units:', error.message);
    return { kit_id: instanceId, type: 'aos_get_service_units', status: 'error', message: error.message };
  }
}

async function handleGetServiceVersions(data) {
  const serviceUuid = data.serviceUuid;
  if (!serviceUuid) return { kit_id: instanceId, type: 'aos_get_service_versions', status: 'error', message: 'No serviceUuid provided' };

  try {
    const service = await curlAosCloud(`services/${serviceUuid}/`);
    const versions = service.versions || [];
    return {
      kit_id: instanceId,
      type: 'aos_get_service_versions',
      status: 'success',
      serviceUuid,
      serviceName: service.title || service.name || 'Unknown',
      description: service.description || '',
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        state: v.state,
        createdAt: v.created_at
      })),
      totalVersions: versions.length
    };
  } catch (error) {
    console.error('[AosCloud] Error getting service versions:', error.message);
    return { kit_id: instanceId, type: 'aos_get_service_versions', status: 'error', message: error.message };
  }
}

async function handleGetUnitMonitoring(data) {
  const unitUid = data.unitUid;
  if (!unitUid) return { kit_id: instanceId, type: 'aos_get_unit_monitoring', status: 'error', message: 'No unitUid provided' };

  try {
    const result = await curlAosCloud(`units/${unitUid}/monitoring/`);

    if (result.message && !result.nodes) {
      return { kit_id: instanceId, type: 'aos_get_unit_monitoring', status: 'error', message: result.message };
    }

    const node = (result.nodes || [])[0] || {};
    const services = node.services || result.services || [];

    return {
      kit_id: instanceId,
      type: 'aos_get_unit_monitoring',
      status: 'success',
      unitUid,
      cpu: node.cpu || result.cpu || 0,
      ram: { used: node.ram_used || 0, total: node.ram_total || 0 },
      disk: { used: node.disk_used || 0, total: node.disk_total || 0 },
      services: services.map((s) => ({
        id: s.service_id || s.id,
        name: s.name || s.service_id,
        cpu: s.cpu || 0,
        ram: s.ram || 0
      })),
      raw: result
    };
  } catch (error) {
    console.error('[AosCloud] Error getting monitoring:', error.message);
    return { kit_id: instanceId, type: 'aos_get_unit_monitoring', status: 'error', message: error.message };
  }
}

async function handleGetAlerts(data) {
  try {
    const result = await curlAosCloud('alerts/?limit=20');
    const items = result.items || result || [];

    return {
      kit_id: instanceId,
      type: 'aos_get_alerts',
      status: 'success',
      alerts: items.map((a) => ({
        id: a.id,
        timestamp: a.timestamp || a.created_at,
        tag: a.tag || a.alert_type || '',
        source: a.source || '',
        message: a.message || a.payload || '',
        severity: a.severity || 'info'
      })),
      total: result.total || items.length
    };
  } catch (error) {
    console.error('[AosCloud] Error getting alerts:', error.message);
    return { kit_id: instanceId, type: 'aos_get_alerts', status: 'error', message: error.message };
  }
}

async function handleRequestServiceLog(data) {
  const { serviceUuid, unitUid, subjectId, minutes } = data;
  if (!serviceUuid || !unitUid || !subjectId) {
    return { kit_id: instanceId, type: 'aos_request_service_log', status: 'error', message: 'serviceUuid, unitUid, and subjectId are required' };
  }

  try {
    const now = new Date();
    const from = new Date(now.getTime() - (minutes || 60) * 60000);
    const payload = JSON.stringify({
      log_id: `log-${Date.now()}`,
      service: serviceUuid,
      unit: unitUid,
      subject: subjectId,
      request_type: 'log',
      date_from: from.toISOString(),
      date_till: now.toISOString()
    });

    const { stdout } = await execAsync(
      `curl -k --http1.1 -X POST ${aoscloudUrl}/api/v10/service-logs/ ` +
      `--cert ${certPath} --cert-type P12 ` +
      `-H "accept: application/json" -H "Content-Type: application/json" ` +
      `-d ${JSON.stringify(payload)}`,
      { env: { ...process.env }, timeout: 15000 }
    );

    const items = JSON.parse(stdout);
    const requests = (Array.isArray(items) ? items : [items]).map((r) => ({
      id: r.id,
      state: r.state,
      nodeId: r.node_id,
      createdAt: r.created_at
    }));

    console.log(`[ServiceLog] Created ${requests.length} log request(s)`);
    return { kit_id: instanceId, type: 'aos_request_service_log', status: 'success', requests };
  } catch (error) {
    console.error('[ServiceLog] Error:', error.message);
    return { kit_id: instanceId, type: 'aos_request_service_log', status: 'error', message: error.message };
  }
}

async function handleGetServiceLogStatus(data) {
  try {
    const result = await curlAosCloud('service-logs/');
    const items = result.items || result || [];

    const logs = items.map((l) => ({
      id: l.id,
      state: l.state,
      service: l.service,
      serviceTitle: l.service_title,
      unit: l.unit,
      nodeId: l.node_id,
      requestType: l.request_type,
      dateFrom: l.date_from,
      dateTill: l.date_till,
      error: l.error_description,
      createdAt: l.created_at
    }));

    return { kit_id: instanceId, type: 'aos_get_service_log_status', status: 'success', logs, total: result.total || logs.length };
  } catch (error) {
    return { kit_id: instanceId, type: 'aos_get_service_log_status', status: 'error', message: error.message };
  }
}

function startBroadcasting() {
  if (broadcastTimer) return;
  broadcastStatus();
  broadcastTimer = setInterval(broadcastStatus, broadcastInterval);
  console.log('[Broadcaster] Status broadcasting started (interval:', broadcastInterval + 'ms)');
}

function stopBroadcasting() {
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
}

function broadcastStatus() {
  const statusUpdate = {
    kit_id: instanceId,
    data: { online: true, last_seen: new Date().toISOString() }
  };
  socket.emit('report-runtime-state', statusUpdate);
  console.log('[Broadcaster] Status broadcast:', statusUpdate.data.online, 'at', statusUpdate.data.last_seen);
}

process.on('SIGINT', () => { stopBroadcasting(); if (socket) socket.disconnect(); process.exit(0); });
process.on('SIGTERM', () => { stopBroadcasting(); if (socket) socket.disconnect(); process.exit(0); });

main().catch((err) => {
  console.error('[Broadcaster] Fatal error:', err);
  process.exit(1);
});
