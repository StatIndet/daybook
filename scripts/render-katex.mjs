import katex from "katex";
import process from "node:process";

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    process.stdout.write("[]");
    return;
  }

  let items = [];
  try {
    items = JSON.parse(input);
  } catch (error) {
    process.stderr.write(`[render-katex] Failed to parse stdin JSON: ${error}\n`);
    process.exit(1);
  }

  const results = items.map((item) => {
    try {
      const html = katex.renderToString(item.tex, {
        displayMode: item.displayMode,
        throwOnError: false,
        strict: "warn",
        trust: false,
        output: "html"
      });

      return {
        id: item.id,
        ok: true,
        html,
        error: ""
      };
    } catch (error) {
      process.stderr.write(`[render-katex] Failed to render formula ${item.id}: ${error}\n`);
      return {
        id: item.id,
        ok: false,
        html: `<span class="katex-error">${escapeHtml(item.tex)}</span>`,
        error: String(error)
      };
    }
  });

  process.stdout.write(JSON.stringify(results));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

main().catch((err) => {
  process.stderr.write(`[render-katex] Fatal error: ${err}\n`);
  process.exit(1);
});
