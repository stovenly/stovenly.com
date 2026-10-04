const markdownIt = require("markdown-it");
const { minifyOutput } = require("./util/minify");

const markdownItOptions = {
  html: true,
  breaks: true,
  linkify: true
};

module.exports = function(eleventyConfig) {
    eleventyConfig.setLibrary("md", markdownIt(markdownItOptions));

    // Add a passthrough copy for the static assets
    eleventyConfig.addPassthroughCopy({"static": "."});
  
    const byOrder = (a, b) => (a.data.order || 0) - (b.data.order || 0);
    for (const name of ["poems", "stories", "games", "projects"]) {
        eleventyConfig.addCollection(name, (collectionApi) =>
            collectionApi.getFilteredByGlob(`src/${name}/*.md`).sort(byOrder));
    }

    // Minify/obfuscate the built output. Skipped during --serve/--watch so the
    // dev output stays readable in devtools.
    eleventyConfig.on("eleventy.after", async ({ dir }) => {
        if (process.env.ELEVENTY_RUN_MODE !== "build") return;
        await minifyOutput(dir.output);
    });

    return {
      dir: {
        input: "src",
        output: "docs"
      }
    };
  };