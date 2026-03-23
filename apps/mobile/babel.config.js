module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Required for @nozbe/watermelondb model decorators (@field, @text, @date, @relation)
      ["@babel/plugin-proposal-decorators", { legacy: true }],
    ],
  };
};
