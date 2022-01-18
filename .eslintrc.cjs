
const rules = {
  semi: ["error", "always"],
  quotes: ["error", "double"],
}

module.exports = {
  extends: '@chatie',
  rules,
  env: {
    jest: true,
  },
}
