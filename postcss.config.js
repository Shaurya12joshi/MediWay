module.exports = {
  plugins: {
    tailwindcss: {},
    // Write px in classes as usual (text-[13px], w-[450px]); they ship as rem so the whole UI
    // scales with the root font size on large screens (see the html rule in src/input.css).
    'postcss-pxtorem': {
      rootValue: 16,
      propList: ['*'],
      // Keep hairline borders crisp
      minPixelValue: 2,
      // Map markers stay px: search.js positions them with px offsets
      selectorBlackList: ['.mw-pin', '.mw-hospital', '.mw-user'],
    },
    autoprefixer: {},
  },
};
