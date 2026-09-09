import assert from 'node:assert/strict';
import { getBranchPaymentSettings, getTenantPaymentSettings, upsertBranchPaymentSettings, deleteBranchPaymentSettings, getTenantBranchPaymentSettings } from '../services/branch-payment-settings';

// Mock Prisma client for testing
process.env.CONNECTIPS_ENABLED = 'true';
process.env.STATIC_PAYMENT_QR_ENABLED = 'true';
process.env.STATIC_PAYMENT_QR_IMAGE_URL = 'https://tenant.example.com/qr.png';
process.env.STATIC_PAYMENT_ACCOUNT_NAME = 'Tenant Main Account';
process.env.STATIC_PAYMENT_ACCOUNT_NUMBER = '1234567890';
process.env.STATIC_PAYMENT_BANK_NAME = 'Nepal Bank Ltd';
process.env.STATIC_PAYMENT_INSTRUCTIONS = 'Pay to tenant account';

const db = require('../utils/db').default as any;
let state: any = {
  branchPaymentSettings: [],
  branches: [
    { id: 'branch-a', tenantId: 'tenant-1', name: 'Branch A' },
    { id: 'branch-b', tenantId: 'tenant-1', name: 'Branch B' },
    { id: 'branch-c', tenantId: 'tenant-2', name: 'Other Tenant Branch' },
  ],
};

// Mock Prisma operations
db.branchPaymentSettings = {
  findUnique: async ({ where }: any) => {
    return state.branchPaymentSettings.find((s: any) => s.branchId === where.branchId) || null;
  },
  upsert: async ({ where, create, update }: any) => {
    const existing = state.branchPaymentSettings.find((s: any) => s.branchId === where.branchId);
    if (existing) {
      Object.assign(existing, update);
      return existing;
    }
    const created = { ...create, id: `bps-${where.branchId}` };
    state.branchPaymentSettings.push(created);
    return created;
  },
  deleteMany: async ({ where }: any) => {
    const before = state.branchPaymentSettings.length;
    state.branchPaymentSettings = state.branchPaymentSettings.filter((s: any) => s.branchId !== where.branchId);
    return { count: before - state.branchPaymentSettings.length };
  },
  findMany: async ({ where }: any) => {
    return state.branchPaymentSettings.filter((s: any) => 
      (where.tenantId ? s.tenantId === where.tenantId : true) &&
      (where.branchId ? s.branchId === where.branchId : true)
    );
  },
};

db.branch = {
  findMany: async ({ where }: any) => {
    return state.branches
      .filter((b: any) => !where.tenantId || b.tenantId === where.tenantId)
      .map((b: any) => ({
        ...b,
        paymentSettings: state.branchPaymentSettings.find((s: any) => s.branchId === b.id) || null,
      }));
  },
};

async function testGetTenantPaymentSettings() {
  const settings = getTenantPaymentSettings();
  assert.equal(settings.connectIpsEnabled, true, 'ConnectIPS should be enabled from env');
  assert.equal(settings.staticQrEnabled, true, 'Static QR should be enabled from env');
  assert.equal(settings.staticQrImageUrl, 'https://tenant.example.com/qr.png');
  assert.equal(settings.accountName, 'Tenant Main Account');
  assert.equal(settings.source, 'tenant_default');
  console.log('✓ getTenantPaymentSettings: env defaults loaded correctly');
}

async function testGetBranchPaymentSettingsNoBranch() {
  const settings = await getBranchPaymentSettings('tenant-1');
  assert.equal(settings.source, 'tenant_default', 'No branch specified should return tenant defaults');
  assert.equal(settings.connectIpsEnabled, true);
  assert.equal(settings.staticQrEnabled, true);
  console.log('✓ getBranchPaymentSettings without branchId: returns tenant defaults');
}

async function testGetBranchPaymentSettingsNoCustom() {
  const settings = await getBranchPaymentSettings('tenant-1', 'branch-a');
  assert.equal(settings.source, 'tenant_default', 'Branch without custom settings should fall back to tenant default');
  assert.equal(settings.branchId, 'branch-a');
  assert.equal(settings.staticQrImageUrl, 'https://tenant.example.com/qr.png');
  console.log('✓ getBranchPaymentSettings (no custom): fallback to tenant defaults');
}

async function testUpsertBranchPaymentSettings() {
  const settings = await upsertBranchPaymentSettings('tenant-1', 'branch-a', {
    staticQrEnabled: true,
    staticQrImageUrl: 'https://branch-a.example.com/qr.png',
    accountName: 'Branch A Account',
    accountNumber: '9876543210',
    bankName: 'Rastriya Bank',
    instructions: 'Pay to branch A account',
  });

  assert.equal(settings.branchId, 'branch-a');
  assert.equal(settings.staticQrEnabled, true);
  assert.equal(settings.accountName, 'Branch A Account');
  console.log('✓ upsertBranchPaymentSettings: custom branch config created');
}

async function testGetBranchPaymentSettingsWithCustom() {
  const settings = await getBranchPaymentSettings('tenant-1', 'branch-a');
  assert.equal(settings.source, 'branch', 'Should return branch-specific settings');
  assert.equal(settings.branchId, 'branch-a');
  assert.equal(settings.staticQrImageUrl, 'https://branch-a.example.com/qr.png');
  assert.equal(settings.accountName, 'Branch A Account');
  assert.equal(settings.connectIpsEnabled, true, 'ConnectIPS always from tenant');
  console.log('✓ getBranchPaymentSettings (with custom): returns branch-specific + tenant ConnectIPS');
}

async function testUpsertValidationMissingFields() {
  try {
    await upsertBranchPaymentSettings('tenant-1', 'branch-b', {
      staticQrEnabled: true,
      staticQrImageUrl: 'https://branch-b.example.com/qr.png',
      accountName: '', // Missing
      accountNumber: '1111111111',
      bankName: 'Test Bank',
    });
    assert.fail('Should reject missing required fields');
  } catch (error: any) {
    assert(error.message.includes('All required fields'), 'Should validate required fields when enabled');
    console.log('✓ upsertBranchPaymentSettings validation: rejects missing required fields');
  }
}

async function testUpsertDisabledIgnoresFields() {
  // When disabled, null values should be stored
  await upsertBranchPaymentSettings('tenant-1', 'branch-b', {
    staticQrEnabled: false,
    staticQrImageUrl: null,
    accountName: null,
    accountNumber: null,
    bankName: null,
    instructions: 'Some instruction',
  });

  const settings = await getBranchPaymentSettings('tenant-1', 'branch-b');
  assert.equal(settings.staticQrEnabled, true);
  assert.equal(settings.accountName, 'Tenant Main Account');
  assert.equal(settings.source, 'tenant_default');
  const stored = state.branchPaymentSettings.find((s: any) => s.branchId === 'branch-b');
  assert.equal(stored.staticQrEnabled, false);
  assert.equal(stored.accountName, null);
  console.log('✓ upsertBranchPaymentSettings (disabled): nullifies QR-specific fields');
}

async function testUpsertUpdateExisting() {
  // First create
  await upsertBranchPaymentSettings('tenant-1', 'branch-a', {
    staticQrEnabled: true,
    staticQrImageUrl: 'https://branch-a-v1.example.com/qr.png',
    accountName: 'Old Name',
    accountNumber: '9876543210',
    bankName: 'Old Bank',
    instructions: 'Old instructions',
  });

  // Then update
  const updated = await upsertBranchPaymentSettings('tenant-1', 'branch-a', {
    staticQrEnabled: true,
    staticQrImageUrl: 'https://branch-a-v2.example.com/qr.png',
    accountName: 'New Name',
    accountNumber: '0123456789',
    bankName: 'New Bank',
    instructions: 'New instructions',
  });

  assert.equal(updated.accountName, 'New Name');
  assert.equal(updated.accountNumber, '0123456789');
  assert.equal(updated.staticQrImageUrl, 'https://branch-a-v2.example.com/qr.png');
  
  // Verify count is still 2 (not duplicated)
  const allSettings = await db.branchPaymentSettings.findMany({ where: { tenantId: 'tenant-1' } });
  assert.equal(allSettings.filter((s: any) => s.branchId === 'branch-a').length, 1, 'Should update not duplicate');
  console.log('✓ upsertBranchPaymentSettings: updates existing record (no duplicate)');
}

async function testDeleteBranchPaymentSettings() {
  await upsertBranchPaymentSettings('tenant-1', 'branch-b', {
    staticQrEnabled: true,
    staticQrImageUrl: 'https://branch-b.example.com/qr.png',
    accountName: 'Branch B',
    accountNumber: '5555555555',
    bankName: 'Test Bank',
  });

  // Verify it exists
  let settings = await getBranchPaymentSettings('tenant-1', 'branch-b');
  assert.equal(settings.source, 'branch');

  // Delete it
  await deleteBranchPaymentSettings('tenant-1', 'branch-b');

  // Verify fallback to tenant
  settings = await getBranchPaymentSettings('tenant-1', 'branch-b');
  assert.equal(settings.source, 'tenant_default', 'After delete should fallback to tenant default');
  console.log('✓ deleteBranchPaymentSettings: reverts to tenant defaults');
}

async function testGetTenantBranchPaymentSettings() {
  // Reset state with mix of configured and non-configured branches
  state.branchPaymentSettings = [
    {
      id: 'bps-branch-a',
      branchId: 'branch-a',
      tenantId: 'tenant-1',
      staticQrEnabled: true,
      staticQrImageUrl: 'https://branch-a.example.com/qr.png',
      accountName: 'Branch A',
      accountNumber: '1111111111',
      bankName: 'Bank A',
    },
  ];

  const audit = await getTenantBranchPaymentSettings('tenant-1');
  
  assert.ok(audit.tenantDefaults);
  assert.equal(audit.tenantDefaults.connectIpsEnabled, true);
  
  assert.equal(audit.branches.length, 2, 'Should list branches in tenant');
  const branchA = audit.branches.find((b: any) => b.branch.id === 'branch-a');
  const branchB = audit.branches.find((b: any) => b.branch.id === 'branch-b');
  
  assert.ok(branchA);
  assert.ok(branchB);
  assert.equal(branchA!.hasCustomSettings, true);
  assert.equal(branchA!.settings?.accountName, 'Branch A');
  
  assert.equal(branchB!.hasCustomSettings, false);
  assert.equal(branchB!.settings, null);
  
  console.log('✓ getTenantBranchPaymentSettings: audit list with custom/default mix');
}

async function testTenantIsolation() {
  // Verify branch-c (tenant-2) doesn't appear in tenant-1 results
  const audit = await getTenantBranchPaymentSettings('tenant-1');
  const tenant2Branch = audit.branches.find((b: any) => b.branch.id === 'branch-c');
  assert.equal(tenant2Branch, undefined, 'Should not leak branches from other tenants');
  console.log('✓ Tenant isolation: branch-c (tenant-2) not visible to tenant-1');
}

async function testFallbackLogicChain() {
  // Scenario: Branch without settings should always show tenant ConnectIPS even when QR disabled
  state.branchPaymentSettings = []; // Reset to no custom settings

  const settings = await getBranchPaymentSettings('tenant-1', 'branch-a');
  
  // Verify fallback chain:
  // - connectIpsEnabled: always from tenant
  // - staticQrEnabled: from branch if set, else tenant default
  // - other fields: from branch if set, else null (not tenant defaults for QR fields)
  assert.equal(settings.connectIpsEnabled, true, 'ConnectIPS always from tenant');
  assert.equal(settings.staticQrEnabled, true, 'Static QR from tenant default (no branch settings)');
  assert.equal(settings.staticQrImageUrl, 'https://tenant.example.com/qr.png', 'QR image from tenant default');
  assert.equal(settings.source, 'tenant_default');
  
  console.log('✓ Fallback logic: tenant defaults apply for all fields when no branch settings');
}

async function testWhitespaceHandling() {
  // Verify that whitespace is trimmed
  const settings = await upsertBranchPaymentSettings('tenant-1', 'branch-c', {
    staticQrEnabled: true,
    staticQrImageUrl: '  https://branch-c.example.com/qr.png  ',
    accountName: '  Branch C Name  ',
    accountNumber: '  7777777777  ',
    bankName: '  Test Bank  ',
    instructions: '  Payment instructions  ',
  });

  assert.equal(settings.staticQrImageUrl, 'https://branch-c.example.com/qr.png', 'Should trim URL');
  assert.equal(settings.accountName, 'Branch C Name', 'Should trim account name');
  assert.equal(settings.instructions, 'Payment instructions', 'Should trim instructions');
  
  console.log('✓ Whitespace handling: strings trimmed before storage');
}

async function main() {
  console.log('\n=== Branch Payment Settings Tests ===\n');
  
  try {
    await testGetTenantPaymentSettings();
    await testGetBranchPaymentSettingsNoBranch();
    await testGetBranchPaymentSettingsNoCustom();
    await testUpsertBranchPaymentSettings();
    await testGetBranchPaymentSettingsWithCustom();
    await testUpsertValidationMissingFields();
    await testUpsertDisabledIgnoresFields();
    await testUpsertUpdateExisting();
    await testDeleteBranchPaymentSettings();
    await testGetTenantBranchPaymentSettings();
    await testTenantIsolation();
    await testFallbackLogicChain();
    await testWhitespaceHandling();
    
    console.log('\n✅ All 13 tests passed (fallback logic, validation, CRUD, isolation)\n');
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    process.exitCode = 1;
  }
}

main();
