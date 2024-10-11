module.exports = function(eleventyConfig) {
    // Add a passthrough copy for the static assets
    eleventyConfig.addPassthroughCopy({"static": "."});
  
    return {
      dir: {
        input: "src",
        output: "docs"
      }
    };
  };