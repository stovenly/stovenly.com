const markdownIt = require("markdown-it");
const markdownItOptions = {
  html: true,
  breaks: true,
  linkify: true
};

module.exports = function(eleventyConfig) {
    eleventyConfig.setLibrary("md", markdownIt(markdownItOptions));

    // Add a passthrough copy for the static assets
    eleventyConfig.addPassthroughCopy({"static": "."});
  
    eleventyConfig.addCollection("poems", function(collectionApi) {
        return collectionApi.getFilteredByGlob("src/poems/*.md");
    });

    eleventyConfig.addCollection("stories", function(collectionApi) {
        return collectionApi.getFilteredByGlob("src/stories/*.md");
    });

    return {
      dir: {
        input: "src",
        output: "docs"
      }
    };
  };