const ECC_CATALOG_DIRECTORY = /^[a-z0-9][a-z0-9-]*$/u;

export const ECC_CATALOG_SKILL_URI = 'skill://ecc-skill-catalog';

export function exactNestedEccSkillUri(directory) {
  if (!ECC_CATALOG_DIRECTORY.test(directory)) {
    throw new Error(`Invalid ECC catalog Skill directory: ${directory}.`);
  }
  return `${ECC_CATALOG_SKILL_URI}/${directory}/SKILL.md`;
}

export function directSkillCandidates(definition) {
  const catalogSkills = new Set(definition.catalogSkills);
  return definition.skills.filter((skill) => !catalogSkills.has(skill));
}

export function exactNestedEccSkillCandidates(definition) {
  return definition.catalogSkills.map(exactNestedEccSkillUri);
}
