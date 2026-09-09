import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const routesDirectory = __dirname;
const routeMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);

// Public routes must be deliberately listed here. These endpoints either
// establish authentication, are static assets, or authenticate a provider by
// a signed callback payload instead of an application session.
const publicRoutes = new Set([
  'mobile-recovery.ts:POST /send',
  'mobile-recovery.ts:POST /confirm',
  'auth.ts:POST /forgot-password',
  'auth.ts:POST /verify-reset-otp',
  'auth.ts:POST /reset-password',
  'certificates.ts:GET /verify/:verificationId',
  'finances.ts:GET /connectips/return/success',
  'finances.ts:GET /connectips/return/failure',
  'finances.ts:POST /nepalpay/webhook',
  'onboarding.ts:POST /request',
]);

function expressionName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  return undefined;
}

function routePath(argument: ts.Expression | undefined): string | undefined {
  if (!argument) return undefined;
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    return argument.text;
  }
  return undefined;
}

function auditFile(filePath: string): string[] {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const failures: string[] = [];
  let routerHasGlobalAuth = false;

  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
    const call = statement.expression;
    if (!ts.isPropertyAccessExpression(call.expression)) continue;
    if (!ts.isIdentifier(call.expression.expression) || call.expression.expression.text !== 'router') continue;

    const method = call.expression.name.text.toLowerCase();
    if (method === 'use' && call.arguments.some((argument) => expressionName(argument) === 'authMiddleware')) {
      routerHasGlobalAuth = true;
      continue;
    }
    if (!routeMethods.has(method)) continue;

    const endpoint = routePath(call.arguments[0]);
    const fileName = path.basename(filePath);
    const key = `${fileName}:${method.toUpperCase()} ${endpoint ?? '<dynamic-path>'}`;
    const hasRouteAuth = call.arguments.slice(1).some((argument) => expressionName(argument) === 'authMiddleware');
    if (!routerHasGlobalAuth && !hasRouteAuth && !publicRoutes.has(key)) failures.push(key);
  }

  return failures;
}

const routeFiles = fs.readdirSync(routesDirectory)
  .filter((name) => name.endsWith('.ts') && name !== path.basename(__filename) && name !== 'static.ts')
  .sort();

const unauthenticatedRoutes = routeFiles.flatMap((name) => auditFile(path.join(routesDirectory, name)));

assert.deepEqual(
  unauthenticatedRoutes,
  [],
  `Sensitive API routes without authMiddleware:\n${unauthenticatedRoutes.map((route) => `- ${route}`).join('\n')}`,
);

console.log(`Route authentication audit passed for ${routeFiles.length} route files.`);
