const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('templates/pages/graph.html', 'utf-8');
const script = fs.readFileSync('static/js/graph.js', 'utf-8');

const dom = new JSDOM(`<html><body>${html}</body></html>`, { runScripts: "dangerously" });
const window = dom.window;
const document = window.document;

window.fetch = async (url) => {
  if (url === '/graph.json') {
    return {
      json: async () => JSON.parse(fs.readFileSync('public/graph.json', 'utf-8'))
    };
  }
  throw new Error("404");
};

window.matchMedia = () => ({ matches: false });

try {
  window.eval(script);
  // Wait for init
  setTimeout(() => {
    try {
      window.daybookGraph.init(document);
      setTimeout(() => {
        console.log("SVG size:", document.querySelector("svg") ? document.querySelector("svg").outerHTML.length : "NO SVG");
        console.log("Circles:", document.querySelectorAll("circle").length);
      }, 500);
    } catch(e) {
      console.error("INIT ERROR", e);
    }
  }, 100);
} catch(e) {
  console.error("EVAL ERROR", e);
}
