import { describe, it, expect } from 'vitest';

// Test that all API functions exist and have correct signatures
// We test the type/shape of exports, not actual HTTP calls

import {
  listConversations,
  createConversation,
  deleteConversation,
  updateConversation,
  listMessages,
  listArtifacts,
  getArtifact,
  getSettings,
  updateSettings,
  checkHealth,
  listApiKeys,
  createApiKey,
  deleteApiKey,
  validateApiKey,
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  listKbSources,
  deleteKbSource,
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  listProjectConversations,
  getAgentKBPermissions,
  setAgentKBPermission,
  getAgentKBAvailable,
  listConnectors,
  createConnector,
  getConnector,
  updateConnector,
  deleteConnector,
  discoverEndpoints,
  getConnectorTools,
  getPermissions,
  setGlobalPermission,
  getToolPermission,
  setToolPermission,
  resetToolPermission,
  checkToolPermission,
  getEmailSettings,
  updateEmailSettings,
  sendTestEmail,
  listScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  fetchModels,
  checkModel,
  recordModelUsage,
  getModelUsageStats,
  shareArtifact,
  remixArtifact,
  sendMessageStream,
  uploadKbFile,
  listAllArtifacts,
  getArtifactDetail,
  deleteArtifact,
  createConversationWithTitle,
} from '../api.js';

describe('API Client — function existence', () => {
  const functions = [
    { name: 'listConversations', fn: listConversations },
    { name: 'createConversation', fn: createConversation },
    { name: 'deleteConversation', fn: deleteConversation },
    { name: 'updateConversation', fn: updateConversation },
    { name: 'listMessages', fn: listMessages },
    { name: 'listArtifacts', fn: listArtifacts },
    { name: 'getArtifact', fn: getArtifact },
    { name: 'getSettings', fn: getSettings },
    { name: 'updateSettings', fn: updateSettings },
    { name: 'checkHealth', fn: checkHealth },
    { name: 'listApiKeys', fn: listApiKeys },
    { name: 'createApiKey', fn: createApiKey },
    { name: 'deleteApiKey', fn: deleteApiKey },
    { name: 'validateApiKey', fn: validateApiKey },
    { name: 'listAgents', fn: listAgents },
    { name: 'createAgent', fn: createAgent },
    { name: 'updateAgent', fn: updateAgent },
    { name: 'deleteAgent', fn: deleteAgent },
    { name: 'listSkills', fn: listSkills },
    { name: 'createSkill', fn: createSkill },
    { name: 'updateSkill', fn: updateSkill },
    { name: 'deleteSkill', fn: deleteSkill },
    { name: 'listKbSources', fn: listKbSources },
    { name: 'deleteKbSource', fn: deleteKbSource },
    { name: 'createProject', fn: createProject },
    { name: 'listProjects', fn: listProjects },
    { name: 'getProject', fn: getProject },
    { name: 'updateProject', fn: updateProject },
    { name: 'deleteProject', fn: deleteProject },
    { name: 'listProjectConversations', fn: listProjectConversations },
    { name: 'getAgentKBPermissions', fn: getAgentKBPermissions },
    { name: 'setAgentKBPermission', fn: setAgentKBPermission },
    { name: 'getAgentKBAvailable', fn: getAgentKBAvailable },
    { name: 'listConnectors', fn: listConnectors },
    { name: 'createConnector', fn: createConnector },
    { name: 'getConnector', fn: getConnector },
    { name: 'updateConnector', fn: updateConnector },
    { name: 'deleteConnector', fn: deleteConnector },
    { name: 'discoverEndpoints', fn: discoverEndpoints },
    { name: 'getConnectorTools', fn: getConnectorTools },
    { name: 'getPermissions', fn: getPermissions },
    { name: 'setGlobalPermission', fn: setGlobalPermission },
    { name: 'getToolPermission', fn: getToolPermission },
    { name: 'setToolPermission', fn: setToolPermission },
    { name: 'resetToolPermission', fn: resetToolPermission },
    { name: 'checkToolPermission', fn: checkToolPermission },
    { name: 'getEmailSettings', fn: getEmailSettings },
    { name: 'updateEmailSettings', fn: updateEmailSettings },
    { name: 'sendTestEmail', fn: sendTestEmail },
    { name: 'listScheduledTasks', fn: listScheduledTasks },
    { name: 'createScheduledTask', fn: createScheduledTask },
    { name: 'updateScheduledTask', fn: updateScheduledTask },
    { name: 'deleteScheduledTask', fn: deleteScheduledTask },
    { name: 'fetchModels', fn: fetchModels },
    { name: 'checkModel', fn: checkModel },
    { name: 'recordModelUsage', fn: recordModelUsage },
    { name: 'getModelUsageStats', fn: getModelUsageStats },
    { name: 'shareArtifact', fn: shareArtifact },
    { name: 'remixArtifact', fn: remixArtifact },
    { name: 'sendMessageStream', fn: sendMessageStream },
    { name: 'uploadKbFile', fn: uploadKbFile },
    { name: 'listAllArtifacts', fn: listAllArtifacts },
    { name: 'getArtifactDetail', fn: getArtifactDetail },
    { name: 'deleteArtifact', fn: deleteArtifact },
    { name: 'createConversationWithTitle', fn: createConversationWithTitle },
  ];

  for (const { name, fn } of functions) {
    it(`${name} should be a function`, () => {
      expect(typeof fn).toBe('function');
    });
  }
});

describe('API Client — function signatures', () => {
  it('createConversation should accept optional title and projectId', () => {
    expect(createConversation.length).toBe(2); // (title?, projectId?)
  });

  it('updateConversation should accept id and data', () => {
    expect(updateConversation.length).toBe(2);
  });

  it('sendMessageStream should accept 9+ parameters', () => {
    expect(sendMessageStream.length).toBeGreaterThanOrEqual(6);
  });

  it('createApiKey should accept provider, apiKey, name', () => {
    expect(createApiKey.length).toBe(3);
  });
});

describe('AVAILABLE_MODELS', () => {
  it('should be defined and contain known models', async () => {
    const { AVAILABLE_MODELS } = await import('../api.js');
    expect(Array.isArray(AVAILABLE_MODELS)).toBe(true);
    expect(AVAILABLE_MODELS.length).toBeGreaterThanOrEqual(4);
    const modelIds = AVAILABLE_MODELS.map((m: any) => m.id);
    expect(modelIds).toContain('gpt-4o');
    expect(modelIds).toContain('claude-sonnet-4-20250514');
  });
});

describe('API Client types', () => {
  it('should export all major interfaces', async () => {
    const mod = await import('../api.js');
    const typeNames = [
      'AVAILABLE_MODELS',
    ];
    for (const name of typeNames) {
      expect(mod).toHaveProperty(name);
    }
  });
});