
const rules = {
  semi: ["error", "always"],
  quotes: ["error", "double"],
  'space-before-function-paren': ["error", "never"],
}

module.exports = {
  extends: '@chatie',
  rules,
  env: {
    jest: true,
  },
}
