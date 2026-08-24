// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  clearMathRenderCache,
  extractLatex,
  extractWordPressLatexFormula,
  processMathElements,
  protectMathForMarkdown,
  scheduleProcessMathElements,
} from "../../../src/utils/math-rendering";
import { sanitizeAndAppendHtml } from "../../../src/utils/safe-html";
import * as obsidian from "obsidian";

describe("Math Rendering Utilities", () => {
  let app: obsidian.App;
  let component: obsidian.Component;

  function getContext() {
    return { app, component };
  }

  beforeEach(() => {
    document.body.empty();
    clearMathRenderCache(document);
    vi.clearAllMocks();
    app = new obsidian.App();
    component = new obsidian.Component();

    vi.spyOn(obsidian.MarkdownRenderer, "render").mockImplementation(
      async (_app, markdown, container) => {
        const display = markdown.startsWith("$$");
        const delimiterLength = display ? 2 : 1;
        const source = markdown
          .slice(delimiterLength, -delimiterLength)
          .trim();
        const el = container.ownerDocument.createElement(
          display ? "div" : "span",
        );
        el.className = `math ${display ? "math-block" : "math-inline"}`;
        const mathJax = container.ownerDocument.createElement("mjx-container");
        mathJax.textContent = `[RENDERED: ${source}]`;
        el.appendChild(mathJax);
        container.appendChild(el);
      },
    );
  });

  afterEach(() => {
    document.body.empty();
    clearMathRenderCache(document);
  });

  function expectRenderedMath(
    element: Element,
    source: string,
    display: boolean,
  ): void {
    expect(element.classList).toContain(display ? "math-block" : "math-inline");
    expect(element.querySelector("mjx-container")?.textContent).toBe(
      `[RENDERED: ${source}]`,
    );
  }

  describe("extractLatex", () => {
    it("extracts display math correctly", () => {
      expect(extractLatex("$$x^2$$")).toEqual({ latex: "x^2", display: true });
      expect(extractLatex("\\[x^2\\]")).toEqual({
        latex: "x^2",
        display: true,
      });
    });

    it("extracts inline math correctly", () => {
      expect(extractLatex("$x^2$")).toEqual({ latex: "x^2", display: false });
      expect(extractLatex("\\(x^2\\)")).toEqual({
        latex: "x^2",
        display: false,
      });
    });
  });

  describe("extractWordPressLatexFormula", () => {
    function getImage(html: string): HTMLImageElement {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const image = doc.querySelector<HTMLImageElement>("img");
      if (!image) throw new Error("expected formula image");
      return image;
    }

    it("decodes WordPress query source and HTML entity separators", () => {
      const image = getImage(
        '<p>Let <img class="latex" src="https://s0.wp.com/latex.php?latex=%7Bf%28t%29+%5Cin+L%5E2%28%7B%5Cbf+R%7D%29%7D&#038;bg=ffffff" alt="fallback" /></p>',
      );

      expect(extractWordPressLatexFormula(image)).toEqual({
        latex: String.raw`{f(t) \in L^2({\bf R})}`,
        rawMath: String.raw`\({f(t) \in L^2({\bf R})}\)`,
        display: false,
      });
    });

    it("uses alt source and display layout for a formula-only paragraph", () => {
      const image = getImage(
        '<p align="center"><img class="latex" src="https://example.com/formula.png" alt="&#92;displaystyle x^2" /></p>',
      );

      expect(extractWordPressLatexFormula(image)).toEqual({
        latex: String.raw`\displaystyle x^2`,
        rawMath: String.raw`\[\displaystyle x^2\]`,
        display: true,
      });
    });

    it("treats a formula inside a legacy named anchor as display math", () => {
      const image = getImage(
        '<p align="center"><a name="explicit-ex"><img class="latex" src="https://s0.wp.com/latex.php?latex=%5Cdisplaystyle+F%28z_1%29&amp;bg=ffffff" alt="&#92;displaystyle F(z_1)" /></a></p>',
      );

      expect(extractWordPressLatexFormula(image)).toEqual({
        latex: String.raw`\displaystyle F(z_1)`,
        rawMath: String.raw`\[\displaystyle F(z_1)\]`,
        display: true,
      });
    });

    it("rejects ordinary images and excessively large formula source", () => {
      const ordinary = getImage(
        '<img src="https://example.com/photo.jpg" alt="photo" />',
      );
      const oversized = getImage(
        `<img class="latex" src="https://example.com/formula.png" alt="${"x".repeat(16_385)}" />`,
      );

      expect(extractWordPressLatexFormula(ordinary)).toBeNull();
      expect(extractWordPressLatexFormula(oversized)).toBeNull();
    });
  });

  describe("processMathElements", () => {
    it("renders WordPress formula images as native inline math", async () => {
      const container = document.createElement("div");
      sanitizeAndAppendHtml(
        container,
        '<p>Let <img class="latex" src="https://s0.wp.com/latex.php?latex=%7Bx%7D&amp;bg=ffffff" alt="{x}" /> be fixed.</p>',
        { mode: "rich" },
      );
      document.body.appendChild(container);

      const result = await processMathElements(container, getContext());

      expect(result.renderedCount).toBe(1);
      expect(container.querySelector("img.latex")).toBeNull();
      const rendered = container.querySelector<HTMLElement>("span.math");
      expect(rendered?.getAttribute("data-math")).toBe(String.raw`\({x}\)`);
      expectRenderedMath(rendered as HTMLElement, "{x}", false);
    });

    it("renders a formula-only paragraph as display math", async () => {
      const container = document.createElement("div");
      sanitizeAndAppendHtml(
        container,
        '<p align="center"><img class="latex" src="https://s0.wp.com/latex.php?latex=%5Cdisplaystyle+x%5E2&amp;bg=ffffff" /></p>',
        { mode: "rich" },
      );
      document.body.appendChild(container);

      await processMathElements(container, getContext());

      const rendered = container.querySelector<HTMLElement>("span.math");
      expect(rendered?.getAttribute("data-math")).toBe(
        String.raw`\[\displaystyle x^2\]`,
      );
      expectRenderedMath(rendered as HTMLElement, String.raw`\displaystyle x^2`, true);
    });

    it("restores the original WordPress formula image when rendering fails", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(obsidian.MarkdownRenderer.render).mockRejectedValueOnce(
        new Error("unsupported formula"),
      );
      const container = document.createElement("div");
      sanitizeAndAppendHtml(
        container,
        '<p>Formula <img class="latex" src="https://s0.wp.com/latex.php?latex=%7Bx%7D&amp;bg=ffffff" srcset="https://s0.wp.com/latex.php?latex=%7Bx%7D 1x" alt="{x}" /></p>',
        { mode: "rich" },
      );
      const originalImage = container.querySelector("img");

      const result = await processMathElements(container, getContext());

      expect(result.failedCount).toBe(1);
      expect(container.querySelector("img.latex")).toBe(originalImage);
      expect(container.querySelector("img")?.getAttribute("srcset")).toContain(
        "1x",
      );
      warn.mockRestore();
    });

    it("replaces text nodes containing math with rendered math elements", async () => {
      const container = document.createElement("div");
      const p = document.createElement("p");
      p.textContent = "Here is $x^2$ and $$\\frac{1}{2}$$";
      container.appendChild(p);
      document.body.appendChild(container);

      await processMathElements(container, getContext());

      const renderedParagraph = container.querySelector("p");
      expect(renderedParagraph).not.toBeNull();
      if (!renderedParagraph) return;

      expect(renderedParagraph.innerHTML).toContain("Here is ");
      const mathSpans = renderedParagraph.querySelectorAll("span.math");
      expect(mathSpans.length).toBe(2);

      const inlineMath = mathSpans[0];
      expect(inlineMath.getAttribute("data-math")).toBe("$x^2$");
      expectRenderedMath(inlineMath, "x^2", false);

      const displayMath = mathSpans[1];
      expect(displayMath.getAttribute("data-math")).toBe("$$\\frac{1}{2}$$");
      expectRenderedMath(displayMath, "\\frac{1}{2}", true);
      expect(obsidian.MarkdownRenderer.render).toHaveBeenCalledWith(
        app,
        "$x^2$",
        expect.any(HTMLElement),
        "",
        component,
      );
    });

    it("renders StackExchange math-container spans from RSS article HTML", async () => {
      const container = document.createElement("div");
      const firstParagraph = document.createElement("p");
      const inlineMath = document.createElement("span");
      inlineMath.className = "math-container";
      inlineMath.appendChild(document.createTextNode("$X$"));
      const categoryMath = document.createElement("span");
      categoryMath.className = "math-container";
      categoryMath.textContent = "$\\mathcal{C}$";
      firstParagraph.append(
        "An object ",
        inlineMath,
        " of ",
        categoryMath,
        ".",
      );

      const secondParagraph = document.createElement("p");
      const displayMath = document.createElement("span");
      displayMath.className = "math-container";
      displayMath.textContent = "$$\n\\operatorname{Hom}(X, Y)\n$$";
      secondParagraph.append(displayMath);
      container.append(firstParagraph, secondParagraph);
      document.body.appendChild(container);

      const result = await processMathElements(container, getContext());

      expect(result.mathContainerCount).toBe(3);
      expect(result.renderedCount).toBe(3);
      expect(container.querySelectorAll("span.math-container").length).toBe(0);

      const mathSpans = container.querySelectorAll("span.math");
      expect(mathSpans.length).toBe(3);
      expect(mathSpans[0].getAttribute("data-math")).toBe("$X$");
      expectRenderedMath(mathSpans[0], "X", false);
      expectRenderedMath(mathSpans[2], "\\operatorname{Hom}(X, Y)", true);
    });

    it("ignores currency values like $10 and $20", async () => {
      const container = document.createElement("div");
      const p = document.createElement("p");
      p.textContent = "It costs $10 and $20 to buy";
      container.appendChild(p);
      document.body.appendChild(container);

      await processMathElements(container, getContext());

      const renderedParagraph = container.querySelector("p");
      expect(renderedParagraph?.innerHTML).toBe("It costs $10 and $20 to buy");
      expect(renderedParagraph?.querySelectorAll("span.math").length).toBe(0);
    });

    it("ignores already rendered math spans to prevent double parsing", async () => {
      const container = document.createElement("div");
      const existingSpan = document.createElement("span");
      existingSpan.className = "math";
      existingSpan.setAttribute("data-math", "$x$");
      existingSpan.textContent = "Already rendered";
      container.appendChild(existingSpan);

      await processMathElements(container, getContext());

      // Should not be modified or re-parsed inside the span
      const spans = container.querySelectorAll("span.math");
      expect(spans.length).toBe(1);
      expect(spans[0].textContent).toBe("Already rendered");
    });

    it("retries scheduled rendering until a reader container is attached", async () => {
      vi.useFakeTimers();
      const requestAnimationFrame = window.requestAnimationFrame;
      window.requestAnimationFrame =
        undefined as unknown as typeof window.requestAnimationFrame;

      try {
        const container = document.createElement("div");
        const mathSpan = document.createElement("span");
        mathSpan.className = "math-container";
        mathSpan.appendChild(document.createTextNode("$X$"));
        container.appendChild(mathSpan);

        const scheduled = scheduleProcessMathElements(
          container,
          getContext(),
          { maxAttachAttempts: 2 },
        );

        await vi.advanceTimersToNextTimerAsync();
        expect(obsidian.MarkdownRenderer.render).not.toHaveBeenCalled();

        document.body.appendChild(container);
        await vi.advanceTimersToNextTimerAsync();
        await scheduled;

        expect(obsidian.MarkdownRenderer.render).toHaveBeenCalledWith(
          app,
          "$X$",
          expect.any(HTMLElement),
          "",
          component,
        );
        expect(container.querySelector("span.math")?.getAttribute("data-math")).toBe(
          "$X$",
        );
      } finally {
        window.requestAnimationFrame = requestAnimationFrame;
        vi.useRealTimers();
      }
    });

    it("uses MarkdownRenderer when MathJax is not exposed on the owning window", async () => {
      vi.useFakeTimers();
      const requestAnimationFrame = window.requestAnimationFrame;
      window.requestAnimationFrame =
        undefined as unknown as typeof window.requestAnimationFrame;

      try {
        const container = document.createElement("div");
        container.textContent = "Formula: $x^2$";
        document.body.appendChild(container);
        delete (window as Window & { MathJax?: unknown }).MathJax;

        const scheduled = scheduleProcessMathElements(container, getContext());

        await vi.runAllTimersAsync();
        await scheduled;

        expect(obsidian.MarkdownRenderer.render).toHaveBeenCalledWith(
          app,
          "$x^2$",
          expect.any(HTMLElement),
          "",
          component,
        );
        expect(container.querySelector("mjx-container")?.textContent).toBe(
          "[RENDERED: x^2]",
        );
      } finally {
        window.requestAnimationFrame = requestAnimationFrame;
        vi.useRealTimers();
      }
    });

    it("renders intact StackExchange math spans after rich HTML sanitization", async () => {
      const container = document.createElement("div");
      const rawHtml = String.raw`<p>Let <span class="math-container">$f:\Delta\to\Delta$</span> be continuous.</p><p><span class="math-container">$$\operatorname{Hom}(X, Y)$$</span></p>`;

      sanitizeAndAppendHtml(container, rawHtml, { mode: "rich" });
      document.body.appendChild(container);

      const before = container.querySelectorAll("span.math-container");
      expect(before.length).toBe(2);
      expect(before[0].childNodes.length).toBe(1);
      expect(before[0].firstChild).toBeInstanceOf(Text);
      expect(before[0].textContent).toBe(String.raw`$f:\Delta\to\Delta$`);

      const result = await processMathElements(container, getContext());

      expect(result).toMatchObject({
        mathContainerCount: 2,
        textNodeMatchCount: 0,
        renderedCount: 2,
        failedCount: 0,
      });
      expect(container.querySelectorAll("mjx-container").length).toBe(2);
    });

    it("renders the PDE feed excerpt with multiline display formulas", async () => {
      const container = document.createElement("div");
      const paragraph = document.createElement("p");
      paragraph.append(
        "Taking (3.35) as an example: ",
        Object.assign(document.createElement("span"), {
          className: "math-container",
          textContent: String.raw`$$ \mathbf{J}_N - \mathbf{J}
 = -\rho'(\varphi_N)\nabla\mu_N + \rho'(\varphi)\nabla\mu $$`,
        }),
        " and the strong convergence ",
        Object.assign(document.createElement("span"), {
          className: "math-container",
          textContent: String.raw`$$ \nabla\mu_N \to \nabla\mu \quad \text{in } L^4(\mathcal{Q}_T), $$`,
        }),
      );
      container.appendChild(paragraph);
      document.body.appendChild(container);

      const result = await processMathElements(container, getContext());

      expect(result).toMatchObject({
        mathContainerCount: 2,
        renderedCount: 2,
        failedCount: 0,
      });
      expect(container.querySelectorAll("span.math-container")).toHaveLength(0);
      expect(container.querySelectorAll("mjx-container")).toHaveLength(2);
    });

    it("passes LaTeX comparison operators directly to the Markdown renderer", async () => {
      const container = document.createElement("div");
      const mathSpan = document.createElement("span");
      mathSpan.className = "math-container";
      mathSpan.textContent = String.raw`$1<p<\infty$`;
      container.appendChild(mathSpan);
      document.body.appendChild(container);

      await processMathElements(container, getContext());

      expect(obsidian.MarkdownRenderer.render).toHaveBeenCalledWith(
        app,
        "$1<p<\\infty$",
        expect.any(HTMLElement),
        "",
        component,
      );
      expect(container.querySelector("span.math")?.getAttribute("data-math")).toBe(
        String.raw`$1<p<\infty$`,
      );
    });

    it("restores the original feed span when fragment rendering fails", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(obsidian.MarkdownRenderer.render).mockRejectedValueOnce(
        new ReferenceError("Math renderer unavailable"),
      );
      const container = document.createElement("div");
      const mathSpan = document.createElement("span");
      mathSpan.className = "math-container";
      mathSpan.appendChild(document.createTextNode("$f:\\Delta\\to\\Delta$"));
      container.appendChild(mathSpan);

      const result = await processMathElements(container, getContext());

      expect(result.renderedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(container.querySelector("span.math-container")?.textContent).toBe(
        "$f:\\Delta\\to\\Delta$",
      );
      warn.mockRestore();
    });

    it("reuses rendered math when an article container is recreated", async () => {
      const firstContainer = document.createElement("div");
      firstContainer.textContent = String.raw`Formula: $\mathrm{GL}_n$`;
      document.body.appendChild(firstContainer);

      await processMathElements(firstContainer, getContext());
      const firstMath = firstContainer.querySelector("span.math");
      firstContainer.remove();

      const reopenedContainer = document.createElement("div");
      reopenedContainer.textContent = String.raw`Formula: $\mathrm{GL}_n$`;
      document.body.appendChild(reopenedContainer);
      await processMathElements(reopenedContainer, getContext());

      const reopenedMath = reopenedContainer.querySelector("span.math");
      expect(obsidian.MarkdownRenderer.render).toHaveBeenCalledTimes(1);
      expect(reopenedMath).not.toBe(firstMath);
      expect(reopenedMath?.getAttribute("data-math")).toBe(
        String.raw`$\mathrm{GL}_n$`,
      );
      expect(reopenedMath?.querySelector("mjx-container")?.textContent).toBe(
        String.raw`[RENDERED: \mathrm{GL}_n]`,
      );
    });

    it("keeps rendered math caches isolated between owning documents", async () => {
      const firstContainer = document.createElement("div");
      firstContainer.textContent = "$x$";
      const popoutDocument = document.implementation.createHTMLDocument();
      const popoutContainer = popoutDocument.createElement("div");
      popoutContainer.textContent = "$x$";

      await processMathElements(firstContainer, getContext());
      await processMathElements(popoutContainer, getContext());

      expect(obsidian.MarkdownRenderer.render).toHaveBeenCalledTimes(2);
      expect(popoutContainer.querySelector("mjx-container")).not.toBeNull();
    });
  });

  describe("protectMathForMarkdown", () => {
    function parseHtml(html: string): Document {
      return new DOMParser().parseFromString(html, "text/html");
    }

    function getMathSpans(html: string): NodeListOf<HTMLElement> {
      return parseHtml(protectMathForMarkdown(html)).querySelectorAll(
        "span.math",
      );
    }

    it("protects raw inline and display dollar math before Turndown", () => {
      const spans = getMathSpans("<p>Inline $a_1$ and display $$b_2$$</p>");

      expect(spans.length).toBe(2);
      expect(spans[0].getAttribute("data-math")).toBe("$a_1$");
      expect(spans[1].getAttribute("data-math")).toBe("$$b_2$$");
    });

    it("normalizes existing math spans and math-container spans", () => {
      const spans = getMathSpans(
        '<p><span class="math" data-math="$a_1$">rendered</span> <span class="math-container">$$b_2$$</span></p>',
      );

      expect(spans.length).toBe(2);
      expect(spans[0].getAttribute("data-math")).toBe("$a_1$");
      expect(spans[1].getAttribute("data-math")).toBe("$$b_2$$");
    });

    it("converts WordPress formula images into protected inline and display math", () => {
      const spans = getMathSpans(
        '<p>Inline <img class="latex" src="https://s0.wp.com/latex.php?latex=%7Ba_1%7D&amp;bg=ffffff" /></p><p><img class="latex" src="https://s0.wp.com/latex.php?latex=%5Cdisplaystyle+b_2&amp;bg=ffffff" /></p>',
      );

      expect(spans).toHaveLength(2);
      expect(spans[0].getAttribute("data-math")).toBe(String.raw`\({a_1}\)`);
      expect(spans[1].getAttribute("data-math")).toBe(
        String.raw`\[\displaystyle b_2\]`,
      );
    });

    it("does not transform math-looking text inside code or pre", () => {
      const protectedHtml = protectMathForMarkdown(
        "<p>$a_1$</p><code>$code_1$</code><pre>$$pre_2$$</pre>",
      );
      const doc = parseHtml(protectedHtml);

      expect(doc.querySelectorAll("span.math").length).toBe(1);
      expect(doc.querySelector("code")?.textContent).toBe("$code_1$");
      expect(doc.querySelector("pre")?.textContent).toBe("$$pre_2$$");
    });
  });
});
