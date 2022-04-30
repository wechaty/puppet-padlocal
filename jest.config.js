module.exports = {
  preset: "ts-jest",
  setupFilesAfterEnv: ["./jest.setup.ts"],
  resolver: "jest-ts-webcompat-resolver",
};
