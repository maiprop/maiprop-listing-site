/** @type {import('i18next-scanner').Options} */
module.exports = {
  input: ["src/**/*.{ts,tsx}", "!src/**/*.test.{ts,tsx}"],
  output: "./",
  options: {
    debug: false,
    removeUnusedKeys: false,
    func: {
      list: ["t", "i18n.t"],
      extensions: [".ts", ".tsx"],
    },
    lngs: ["en", "el"],
    ns: ["translation"],
    defaultLng: "en",
    defaultNs: "translation",
    defaultValue: "",
    resource: {
      loadPath: "src/locales/{{lng}}.json",
      savePath: "src/locales/{{lng}}.json",
      jsonIndent: 2,
      lineEnding: "\n",
    },
    interpolation: {
      prefix: "{{",
      suffix: "}}",
    },
  },
};
