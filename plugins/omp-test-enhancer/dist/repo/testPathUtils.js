export function isTestFilePath(path) {
    return /\.(test|spec|cy)\.[cm]?[tj]sx?$/.test(path) || /(^|\/)__tests__\//.test(path) || /(^|\/)tests\//.test(path);
}
export function isFrontendEntryFile(path) {
    return /(^|\/)(app|pages|routes)\//i.test(path) || /(^|\/)(page|layout|template|loading|error|not-found|App|Root|main)\.[cm]?[tj]sx?$/.test(path);
}
