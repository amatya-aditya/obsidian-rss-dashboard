import { afterAll } from "vitest";

// Files in the shared-environment project reuse one jsdom per worker, so a
// listener a file leaves on `document` or `window` would fire during the next
// file's events. Record what each file attaches there and detach it afterwards.
// Also empty the body so the next file starts from a blank page.
//
// This setup file is evaluated again for every test file, but `document` and
// `window` outlive it, so the patch and its record live on `window`.
type Registration = {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
};

const STORE = Symbol.for("rss-dashboard.shared-environment.registrations");
const store = window as unknown as { [STORE]?: Registration[] };
const registrations = (store[STORE] ??= []);

const PATCHED = Symbol.for("rss-dashboard.shared-environment.patched");
const patchTarget = (target: EventTarget & { [PATCHED]?: boolean }): void => {
  if (target[PATCHED]) return;
  target[PATCHED] = true;
  const original = target.addEventListener.bind(target);
  target.addEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void => {
    if (listener) registrations.push({ target, type, listener, options });
    original(type, listener, options);
  };
};

patchTarget(document);
patchTarget(window);

afterAll(() => {
  for (const { target, type, listener, options } of registrations) {
    target.removeEventListener(type, listener, options);
  }
  registrations.length = 0;
  document.body.replaceChildren();
});
