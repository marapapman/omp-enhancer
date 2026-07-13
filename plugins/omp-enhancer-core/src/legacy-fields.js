const LEGACY_CONTROL_FIELDS = Object.freeze([
  'hardBlock',
  'hardBlockReasons',
  'shouldForkSubagents',
  'gateMode',
  'skillGateMode',
  'gateRecoveryMode',
  'approvalState',
  'actionBoundary',
  'gateController',
]);

const LEGACY_ROUTE_ALIAS_FIELDS = Object.freeze([
  'requiredSkills',
  'requiredTools',
  'requiredSubagents',
]);

export function withoutLegacyControlFields(value = {}) {
  return omitFields(value, LEGACY_CONTROL_FIELDS);
}

export function withoutLegacyRouteFields(value = {}) {
  return omitFields(value, [
    ...LEGACY_ROUTE_ALIAS_FIELDS,
    'hardBlock',
    'hardBlockReasons',
    'gateMode',
    'skillGateMode',
    'shouldForkSubagents',
  ]);
}

function omitFields(value, fields) {
  const result = { ...value };
  for (const field of fields) delete result[field];
  return result;
}
