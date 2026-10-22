import { describe, expect, it } from "vitest";
import {
  cleanFetchedArticleHtml,
  stripImageExpandControlsFromDocument,
} from "../../../src/utils/reader-html-cleanup";

const IMAGE_URL = "https://img.example.com/photo.jpg";
const LABEL = "Press enter or click to view image in full size";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function mediumFigure(label = LABEL): string {
  return `<figure>
    <div role="button" tabindex="0">
      <span>${label}</span>
      <div>
        <picture>
          <source srcset="${IMAGE_URL} 640w, ${IMAGE_URL} 1400w" type="image/webp">
          <img alt="" width="700" height="365" role="presentation">
        </picture>
      </div>
    </div>
    <figcaption>A caption under the picture</figcaption>
  </figure>`;
}

describe("stripImageExpandControlsFromDocument", () => {
  it("unwraps the control and drops its label, keeping the picture before the caption", () => {
    const doc = parse(mediumFigure());

    stripImageExpandControlsFromDocument(doc);

    const figure = doc.body.querySelector("figure");
    const mediaOrder = Array.from(
      figure?.querySelectorAll("picture, img, figcaption") ?? [],
    ).map((el) => el.tagName.toLowerCase());

    expect(figure).not.toBeNull();
    expect(doc.body.textContent).not.toContain(LABEL);
    expect(figure?.querySelector("[role='button']")).toBeNull();
    expect(figure?.querySelector("picture img")).not.toBeNull();
    expect(figure?.querySelector("figcaption")?.textContent).toBe(
      "A caption under the picture",
    );
    expect(mediaOrder).toEqual(["picture", "img", "figcaption"]);
  });

  it("drops a localized label without matching the English text", () => {
    const localized =
      "Pulsa Intro o haz clic para ver la imagen a tamaño completo";
    const doc = parse(mediumFigure(localized));

    stripImageExpandControlsFromDocument(doc);

    expect(doc.body.textContent).not.toContain(localized);
    expect(doc.body.querySelector("figure img")).not.toBeNull();
    expect(doc.body.querySelector("figcaption")).not.toBeNull();
  });

  it("leaves a control-shaped wrapper that holds no picture or image alone", () => {
    const doc = parse(
      `<div role="button" tabindex="0"><span>${LABEL}</span></div>`,
    );

    stripImageExpandControlsFromDocument(doc);

    expect(doc.body.querySelector("[role='button']")).not.toBeNull();
    expect(doc.body.textContent).toContain(LABEL);
  });

  it("keeps an anchor that links an image", () => {
    const doc = parse(
      `<figure><a href="https://example.com/story"><img src="${IMAGE_URL}" alt="Photo"></a><figcaption>Caption</figcaption></figure>`,
    );

    stripImageExpandControlsFromDocument(doc);

    expect(doc.body.querySelector("figure a img")).not.toBeNull();
    expect(doc.body.querySelector("figcaption")?.textContent).toBe("Caption");
  });

  it("keeps a role=link wrapper that links an image", () => {
    const doc = parse(
      `<figure><div role="link" tabindex="0"><span>Open the story</span><img src="${IMAGE_URL}" alt="Photo"></div><figcaption>Caption</figcaption></figure>`,
    );

    stripImageExpandControlsFromDocument(doc);

    expect(doc.body.querySelector("figure [role='link'] img")).not.toBeNull();
    expect(doc.body.textContent).toContain("Open the story");
  });

  it("treats a focusable wrapper without an explicit role as a control", () => {
    const doc = parse(
      `<figure><div tabindex="0"><span>${LABEL}</span><img src="${IMAGE_URL}"></div><figcaption>Caption</figcaption></figure>`,
    );

    stripImageExpandControlsFromDocument(doc);

    expect(doc.body.textContent).not.toContain(LABEL);
    expect(doc.body.querySelector("figure div[tabindex]")).toBeNull();
    expect(doc.body.querySelector("figure img")).not.toBeNull();
  });

  it("unwraps a native button around a picture and drops its label", () => {
    const doc = parse(
      `<figure><button type="button"><span>${LABEL}</span><img src="${IMAGE_URL}" alt="Photo"></button><figcaption>Caption</figcaption></figure>`,
    );

    stripImageExpandControlsFromDocument(doc);

    expect(doc.body.textContent).not.toContain(LABEL);
    expect(doc.body.querySelector("figure button")).toBeNull();
    expect(doc.body.querySelector("figure img")).not.toBeNull();
    expect(doc.body.querySelector("figcaption")?.textContent).toBe("Caption");
  });

  it("drops a label wrapped in a paragraph", () => {
    const doc = parse(
      `<figure><div role="button" tabindex="0"><p>${LABEL}</p><img src="${IMAGE_URL}" alt="Photo"></div><figcaption>Caption</figcaption></figure>`,
    );

    stripImageExpandControlsFromDocument(doc);

    expect(doc.body.textContent).not.toContain(LABEL);
    expect(doc.body.querySelector("figure img")).not.toBeNull();
  });

  it("keeps a text-only link inside the control", () => {
    const doc = parse(
      `<figure><div role="button" tabindex="0"><a href="https://example.com/gallery">View gallery</a><img src="${IMAGE_URL}" alt="Photo"></div><figcaption>Caption</figcaption></figure>`,
    );

    stripImageExpandControlsFromDocument(doc);

    expect(doc.body.textContent).toContain("View gallery");
    expect(
      doc.body.querySelector("a[href='https://example.com/gallery']"),
    ).not.toBeNull();
  });

  it("leaves a tabindex=-1 wrapper alone", () => {
    const doc = parse(
      `<figure><div tabindex="-1"><span>Scrollable region</span><img src="${IMAGE_URL}" alt="Photo"></div><figcaption>Caption</figcaption></figure>`,
    );

    stripImageExpandControlsFromDocument(doc);

    expect(doc.body.querySelector("figure div[tabindex='-1']")).not.toBeNull();
    expect(doc.body.textContent).toContain("Scrollable region");
  });

  it("drops a localized label after Readability rewrites the control as a paragraph", () => {
    const localized =
      "Pulsa Intro o haz clic para ver la imagen a tamaño completo";
    const doc = parse(
      `<figure><p><span>${localized}</span><img src="${IMAGE_URL}" alt="Foto"></p><figcaption>Caption</figcaption></figure>`,
    );

    stripImageExpandControlsFromDocument(doc);

    expect(doc.body.textContent).not.toContain(localized);
    expect(doc.body.querySelector("figure img")).not.toBeNull();
    expect(doc.body.querySelector("figure p")).toBeNull();
    expect(doc.body.querySelector("figcaption")?.textContent).toBe("Caption");
  });

  it("keeps a figure paragraph whose image carries ordinary prose", () => {
    const doc = parse(
      `<figure><p><img src="${IMAGE_URL}" alt="Photo">A sentence that is not a control label.</p><figcaption>Caption</figcaption></figure>`,
    );

    stripImageExpandControlsFromDocument(doc);

    expect(doc.body.querySelector("figure p")).not.toBeNull();
    expect(doc.body.textContent).toContain(
      "A sentence that is not a control label.",
    );
  });

  it("does nothing for a body-less document", () => {
    const doc = document.implementation.createHTMLDocument("empty");
    doc.documentElement.removeChild(doc.body);

    expect(() => stripImageExpandControlsFromDocument(doc)).not.toThrow();
  });
});

describe("cleanFetchedArticleHtml and the image-expand control", () => {
  it("cleans the body used for a saved fetched note", () => {
    const html = cleanFetchedArticleHtml(mediumFigure());

    expect(html).not.toContain(LABEL);
    expect(html).toContain(IMAGE_URL);
    expect(html).toContain("A caption under the picture");
    expect(html).not.toContain('role="button"');
  });
});

describe("cleanFetchedArticleHtml short lead-in blocks (#1500)", () => {
  const DESCRIPTION = "A one line summary of the page";
  const BODY =
    "The first substantial paragraph of the fixture runs well past one " +
    "hundred and twenty characters so it marks where the body starts.";

  it("drops a short block that precedes the repeated description", () => {
    const html = cleanFetchedArticleHtml(
      `<p>Short lead-in</p><p>${DESCRIPTION}</p><p>${BODY}</p>`,
      { feedDescriptionHtml: `<p>${DESCRIPTION}</p>` },
    );

    expect(html).not.toContain("Short lead-in");
    expect(html).not.toContain(DESCRIPTION);
    expect(html).toContain(BODY);
  });

  it("keeps a short block an extractor marked as content", () => {
    const html = cleanFetchedArticleHtml(
      `<p data-rss-keep-lead>Open - opened by @a</p><p>${DESCRIPTION}</p><p>${BODY}</p>`,
      { feedDescriptionHtml: `<p>${DESCRIPTION}</p>` },
    );

    expect(html).toContain("Open - opened by @a");
    expect(html).not.toContain(DESCRIPTION);
    expect(html).toContain(BODY);
  });
});
