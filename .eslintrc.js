module.exports = {
  env: {
    browser: true,
    es6: true,
    jest: true
  },
  extends: [
    'standard-with-typescript'
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly'
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  // plugins: ['jest'],
  rules: {
    // '@typescript-eslint/no-redeclare': 'off'
    '@typescript-eslint/strict-boolean-expressions': 'off'
  }
}
