
const rules = {
  semi: ["error", "always"],
  quotes: ["error", "double"],
  "space-before-function-paren": ["error", {
    "anonymous": "never",
    "named": "never",
    "asyncArrow": "always"
  }],
  'array-bracket-spacing': ["error", "never"]
}

module.exports = {
  extends: '@chatie',
  rules,
  env: {
    jest: true,
  },
}
