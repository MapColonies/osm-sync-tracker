module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        "scope-enum": [2, "always", ["deps", "configurations", "sync", "file", "entity", "changeset", "entityHistory"]],
    }
};
