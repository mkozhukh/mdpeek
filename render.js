import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import hljsSvelte from "highlightjs-svelte";

hljsSvelte(hljs);
hljs.registerAliases(["jsx"], { languageName: "javascript" });
hljs.registerAliases(["tsx"], { languageName: "typescript" });

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang === "mermaid") return code;
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

const renderer = {
  code({ text, lang }) {
    if (lang === "mermaid") {
      return `<pre class="mermaid">${text}</pre>`;
    }
    return false; // fall back to default
  },
};

marked.use({ renderer });

export function renderMarkdown(mdString) {
  let frontMatter = null;
  let content = mdString;

  if (content.startsWith("---\n") || content.startsWith("---\r\n")) {
    const endMarker = content.indexOf("\n---", 3);
    if (endMarker !== -1) {
      const fmBlock = content.slice(content.indexOf("\n") + 1, endMarker);
      content = content.slice(endMarker + 4).replace(/^\r?\n/, "");
      frontMatter = {};
      for (const line of fmBlock.split("\n")) {
        const match = line.match(/^(\w[\w.-]*)\s*:\s*(.*)/);
        if (match) {
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          frontMatter[match[1]] = val;
        }
      }
    }
  }

  const html = marked.parse(content);
  return { html, frontMatter };
}
